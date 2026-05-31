from typing import List, Dict
from pydantic import BaseModel, Field
from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam
import os
import logging

from dotenv import load_dotenv

load_dotenv()

# Set up logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# --------------------------------------------------------------
# Step 1: Define the data models
# --------------------------------------------------------------


class SubTask(BaseModel):
    """Blog section task defined by orchestrator"""

    section_type: str = Field(description="Type of blog section to write")
    description: str = Field(description="What this section should cover")
    style_guide: str = Field(description="Writing style for this section")
    target_length: int = Field(description="Target word count for this section")


class OrchestratorPlan(BaseModel):
    """Orchestrator's blog structure and tasks"""

    topic_analysis: str = Field(description="Analysis of the blog topic")
    target_audience: str = Field(description="Intended audience for the blog")
    sections: List[SubTask] = Field(description="List of sections to write")


class SectionContent(BaseModel):
    """Content written by a worker"""

    content: str = Field(description="Written content for this section")
    key_points: List[str] = Field(description="Main points covered")


class SuggestedEdits(BaseModel):
    """Suggested edits for a section"""

    section_name: str = Field(description="Name of the section to edit")
    suggested_edit: str = Field(description="Suggested edit")


class ReviewFeedback(BaseModel):
    """Final review and siggestions"""

    cohesion_score: float = Field(description="How well sections flow together (0-1)")
    suggested_edits: List[SuggestedEdits] = Field(
        description="Suggested edits by section"
    )
    final_version: str = Field(description="Complete, polished blog post")


# --------------------------------------------------------------
# Step 2 Define prompts
# --------------------------------------------------------------

ORCHESTRATOR_PROMPT = """
Analyze this blog topic and break it down into logical sections.

Topic: {topic}
Target Length: {target_length} words
Style: {style}

Return your response in this format:

# Analysis
Analyze the topic and explain how it should be structured.
Consider the narrative flow and how sections will work together.

# Target Audience
Define the target audience and their interests/needs.

# Sections
## Section 1
- Type: section_type
- Description: what this section should cover
- Style: writing style guidelines

[Additional sections as needed...]
"""

WORKER_PROMPT = """
Write a blog section based on:
Topic: {topic}
Section Type: {section_type}
Section Goal: {description}
Style Guide: {style_guide}

Return your response in this format:

# Content
[Your section content here, following the style guide]

# Key Points
- Main point 1
- Main point 2
[Additional points as needed...]
"""

REVIEWER_PROMPT = """
Review this blog post for cohesion and flow:

Topic: {topic}
Target Audience: {audience}

Sections:
{sections}

Provide a cohesion score between 0.0 and 1.0, suggested edits for each section if needed, and a final polished version of the complete post.

The cohesion score should reflect how well the sections flow together, with 1.0 being perfect cohesion.
For suggested edits, focus on improving transitions and maintaining consistent tone across sections.
The final version should incorporate your suggested improvements into a polished, cohesive blog post.
"""

# Step 3: Implement the orchestrator function


class BlogOrchestrator:
    def __init__(self):
        self.sections_content = {}

    def get_plan(self, topic: str, target_length: int, style: str) -> OrchestratorPlan:
        """Get orchestrator's blog structure plan"""
        messages: list[ChatCompletionMessageParam] = [
            {
                "role": "system",
                "content": ORCHESTRATOR_PROMPT.format(
                    topic=topic,
                    target_length=target_length,
                    style=style,
                ),
            }
        ]
        completion = client.chat.completions.parse(
            model=MODEL,
            messages=messages,
            response_format=OrchestratorPlan,
        )
        plan = completion.choices[0].message.parsed
        if plan is None:
            raise ValueError("Failed to parse orchestrator plan")
        return plan

    def write_section(self, topic: str, section: SubTask) -> SectionContent:
        """Worker: Write a specific blog section with context from previous sections.

        Args:
          topic: The main blog topic
          section: SubTask containing section details

        Returns:
        SectionContent: THe written content and key points
        """
        # Create context from previously written sections
        previous_sections = "\n\n".join(
            [
                f"==={section_type}===\n{content.content}"
                for section_type, content in self.sections_content.items()
            ]
        )

        messages: list[ChatCompletionMessageParam] = [
            {
                "role": "system",
                "content": WORKER_PROMPT.format(
                    topic=topic,
                    section_type=section.section_type,
                    description=section.description,
                    style_guide=section.style_guide,
                    target_length=section.target_length,
                    previous_sections=(
                        previous_sections
                        if previous_sections
                        else "This is the first section."
                    ),
                ),
            }
        ]
        completion = client.beta.chat.completions.parse(
            model=MODEL,
            messages=messages,
            response_format=SectionContent,
        )
        section_content = completion.choices[0].message.parsed
        if section_content is None:
            raise ValueError("Failed to parse section content")
        return section_content

    def review_post(self, topic: str, plan: OrchestratorPlan) -> ReviewFeedback:
        """Reviewer: Analyze and improve overall cohesion"""
        section_text = "\n\n".join(
            [
                f"==={section_type}===\n{content.content}"
                for section_type, content in self.sections_content.items()
            ]
        )
        completion = client.beta.chat.completions.parse(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": REVIEWER_PROMPT.format(
                        topic=topic,
                        audience=plan.target_audience,
                        sections=section_text,
                    ),
                }
            ],
            response_format=ReviewFeedback,
        )
        review = completion.choices[0].message.parsed
        if review is None:
            raise ValueError("Failed to parse review feedback")
        return review

    def write_blog(
        self, topic: str, target_length: int = 1000, style: str = "informative"
    ) -> Dict:
        """Process the entire blog writing task"""
        logger.info(f"Starting blog writing task for: {topic}")

        # Get blog structure plan
        plan = self.get_plan(topic, target_length, style)
        logger.info(f"Blog structure planned: {len(plan.sections)} sections")
        logger.info(f"Blog structure planned: {plan.model_dump_json(indent=2)}")

        # write each section
        for section in plan.sections:
            logger.info(f"Writing section: {section.section_type}")
            content = self.write_section(topic, section)
            self.sections_content[section.section_type] = content

        # Review and polish
        logger.info("Reviewing full blog post")
        review = self.review_post(topic, plan)

        return {"structure": plan, "sections": self.sections_content, "review": review}


# --------------------------------------------------------------
# Step 4: Example usage
# --------------------------------------------------------------

if __name__ == "__main__":
    orchestrator = BlogOrchestrator()
    result = orchestrator.write_blog(
        topic="The impact of AI on software development",
        target_length=1200,
        style="technical but accessbible",
    )

    print("\nFinal Blog Post:")
    print(result["review"].final_version)

    print("\nCohesion Score:", result["review"].cohesion_score)
    if result["review"].suggested_edits:
        for edit in result["review"].suggested_edits:
            print(f"\nSection: {edit.section_name}")
            print(f"Suggested Edit: {edit.suggested_edit}")

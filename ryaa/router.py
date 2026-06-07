from pydantic import BaseModel, Field

from ryaa.providers.base import LLMProvider, Message


class Route(BaseModel):
    skill: str = Field(description="The name of the skill best matching the request")
    confidence: float = Field(description="Confidence between 0 and 1")


class Router:
    def __init__(
        self, provider: LLMProvider, skills: dict[str, str], model: str | None = None
    ):
        self.provider = provider
        self.skills = skills
        self.model = model

    def route(self, text: str) -> Route:
        menu = "\n".join(f"- {name}: {desc}" for name, desc in self.skills.items())
        return self.provider.structured(
            messages=[
                Message(
                    role="system",
                    content=(
                        "Classify the user's request into exactly one of these skills. "
                        f"If none fit use 'unknown'.\n{menu}"
                    ),
                ),
                Message(role="user", content=text),
            ],
            schema=Route,
            model=self.model,
        )

from dotenv import load_dotenv

load_dotenv()

import logging

from ryaa.providers.openai_provider import OpenAIProvider
from ryaa.skills.calendar import CalendarSkill

logging.basicConfig(level=logging.INFO)

skill = CalendarSkill(provider=OpenAIProvider())

print("\n--- VALID EVENT ---")
print(skill.process("Schedule a 1h study group next Tuesday at 2pm with Alice and Bob"))

print("\n--- SHOULD BE REJECTED ---")
print(skill.process("What's the capital of France?"))

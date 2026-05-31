import os

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Step 1: Define the response format in a Pydantic model


class CalendarEvent(BaseModel):
    name: str
    date: str
    participants: list[str]


# Step 2: call the model

completion = client.beta.chat.completions.parse(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "Extract the event infomation.."},
        {
            "role": "user",
            "content": "ALice and Bob are going to a science fair on Friday.",
        },
    ],
    response_format=CalendarEvent,
)

# Step 3 Parse the response

event = completion.choices[0].message.parsed
if event is None:
    raise ValueError("Failed to parse calendar event")
event.name
event.date
event.participants

print(event)

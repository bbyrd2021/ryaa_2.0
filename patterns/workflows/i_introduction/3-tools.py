import json
import os

import requests
from openai import OpenAI
from openai.types.chat import (
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionMessageParam,
    ChatCompletionToolParam,
)
from pydantic import BaseModel, Field

from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Define the tool (function) that will be used in the model


def get_weather(latitude: float, longitude: float) -> str:
    """This is a publicallay available API that returns the weather for a given location."""
    response = requests.get(
        f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m"
    )

    data = response.json()
    return data


# Step 1 call model with get weather  tool defined

tools: list[ChatCompletionToolParam] = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current temperature for provided coordinates\
                 in celsius.",
            "parameters": {
                "type": "object",
                "properties": {
                    "latitude": {"type": "number"},
                    "longitude": {"type": "number"},
                },
                "required": ["latitude", "longitude"],
                "additionalProperties": False,
            },
            "strict": True,
        },
    }
]

system_prompt = """
You are helpful weather assistant.
"""

messages: list[ChatCompletionMessageParam] = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": "What's the weather like in Paris today?"},
]

completion = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=tools,
)

# Step 2: Model decides to use the tool

completion.model_dump()

# Step 3 Execute get_weather function


def call_function(name, args):
    if name == "get_weather":
        return get_weather(**args)
    else:
        raise ValueError(f"Unknown function: {name}")


tool_calls = completion.choices[0].message.tool_calls
if tool_calls:
    for tool_call in tool_calls:
        if not isinstance(tool_call, ChatCompletionMessageFunctionToolCall):
            continue
        name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)
        messages.append(completion.choices[0].message)  # type: ignore[arg-type]  # response message reused as input param

        result = call_function(name, args)
        messages.append(
            {
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result),
            }
        )

# Step 4 Supply result and call model again


class WeatherResponse(BaseModel):
    temperature: float = Field(
        description="The current temperature in degrees Celsius for the location given."
    )

    response: str = Field(
        description="A natural language response to the user's question."
    )


completion_2 = client.beta.chat.completions.parse(
    model="gpt-4o",
    messages=messages,
    response_format=WeatherResponse,
    tools=tools,
)

# Step 5: Check model response

final_response = completion_2.choices[0].message.parsed
if final_response is None:
    raise ValueError("Failed to parse weather response")

# final_response.temperature
# final_response.response

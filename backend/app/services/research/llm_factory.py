"""LLM provider factory — easily switch between Gemini, OpenAI, and Anthropic.

Defaults to Google Gemini via `langchain-google-genai`.
Other providers like OpenAI or Anthropic can be selected by setting
the `LLM_PROVIDER` environment variable (e.g. `LLM_PROVIDER=openai`).
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)


def get_llm(provider: str, model: str, api_key: str) -> BaseChatModel:
    """Return a LangChain ChatModel instance for the requested provider.

    Args:
        provider: "gemini" | "openai" | "anthropic"
        model: Model identifier string (e.g. "gemini-3.5-flash-lite", "gpt-4o-mini", etc.)
        api_key: Plaintext API key for the provider.

    Returns:
        A LangChain BaseChatModel instance.
    """
    prov = (provider or "gemini").lower().strip()

    if prov == "gemini":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(
                model=model or "gemini-3.5-flash-lite",
                google_api_key=api_key,
                temperature=0.1,
                max_retries=2,
            )
        except ImportError:
            raise RuntimeError(
                "langchain-google-genai is not installed. Install it with `pip install langchain-google-genai`."
            )

    if prov == "openai":
        try:
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model or "gpt-4o-mini",
                api_key=api_key,
                temperature=0.1,
                max_retries=2,
            )
        except ImportError:
            raise RuntimeError(
                "langchain-openai is not installed. Install it with `pip install langchain-openai`."
            )

    if prov == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(
                model=model or "claude-3-5-haiku-latest",
                api_key=api_key,
                temperature=0.1,
                max_retries=2,
            )
        except ImportError:
            raise RuntimeError(
                "langchain-anthropic is not installed. Install it with `pip install langchain-anthropic`."
            )

    raise ValueError(
        f"Unsupported LLM provider: {provider!r}. Supported providers: 'gemini', 'openai', 'anthropic'."
    )

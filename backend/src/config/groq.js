// Groq chat model shared by every LLM feature (PHR self-assessment, EMR InferAssist,
// diet plans, scribe). Groq retired llama-3.3-70b-versatile (404 model_not_found),
// so this is overridable with GROQ_LLM_MODEL instead of a code change next time.
const GROQ_LLM_MODEL = process.env.GROQ_LLM_MODEL || 'openai/gpt-oss-120b';

// gpt-oss models reason before answering; low effort keeps latency down and leaves
// the max_tokens budget for the actual answer. Other models reject this parameter.
function groqModelParams() {
  return GROQ_LLM_MODEL.startsWith('openai/gpt-oss')
    ? { model: GROQ_LLM_MODEL, reasoning_effort: 'low' }
    : { model: GROQ_LLM_MODEL };
}

module.exports = { GROQ_LLM_MODEL, groqModelParams };

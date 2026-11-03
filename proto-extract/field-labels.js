// Protobuf field labels emitted by the extractor live here so the proto3
// normalization can be tested without running the whole bundle extraction.
const PROTO3_INVALID_LABELS = new Set(['required']);

const fieldLabel = (flagName) => {
  const label = flagName.toLowerCase();
  return PROTO3_INVALID_LABELS.has(label) ? null : label;
};

module.exports = { fieldLabel };

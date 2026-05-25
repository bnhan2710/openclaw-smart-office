export function envelope(skill, data, meta = {}) {
  return {
    success: true,
    data,
    error: null,
    meta: {
      skill,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

export function errorEnvelope(skill, error, meta = {}) {
  return {
    success: false,
    data: null,
    error: error instanceof Error ? error.message : String(error),
    meta: {
      skill,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

export function printEnvelope(skill, data, meta) {
  console.log(JSON.stringify(envelope(skill, data, meta), null, 2));
}

export function printError(skill, error, meta) {
  console.log(JSON.stringify(errorEnvelope(skill, error, meta), null, 2));
}

export function bindWindowActions(actions) {
  if (!actions || typeof actions !== 'object') return;
  Object.entries(actions).forEach(([name, action]) => {
    window[name] = action;
  });
}

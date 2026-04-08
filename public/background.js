const api = typeof browser !== 'undefined' ? browser : chrome;
api.commands.onCommand.addListener(async (command) => {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) return;
  if (command === 'toggle-drawer')
    api.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_DRAWER' });
  if (command === 'create-highlight')
    api.tabs.sendMessage(tabs[0].id, { type: 'CREATE_HIGHLIGHT' });
});

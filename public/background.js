browser.commands.onCommand.addListener(async (command) => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) return;
  if (command === 'toggle-drawer')
    browser.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_DRAWER' });
  if (command === 'create-highlight')
    browser.tabs.sendMessage(tabs[0].id, { type: 'CREATE_HIGHLIGHT' });
});

export type GroupedAppController<
  TShell extends object,
  TChat extends object,
  TAgent extends object,
  TSettings extends object,
  TAutomation extends object
> = {
  shell: TShell;
  chat: TChat;
  agent: TAgent;
  settings: TSettings;
  automation: TAutomation;
};

export const createAppController = <
  TShell extends object,
  TChat extends object,
  TAgent extends object,
  TSettings extends object,
  TAutomation extends object
>(
  controller: GroupedAppController<TShell, TChat, TAgent, TSettings, TAutomation>
) => controller;

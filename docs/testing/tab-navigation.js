// npm run dev -w @fin/web -- --host 127.0.0.1 --port 5174 --strictPort
// Then: playwriter -s <session> -f docs/testing/tab-navigation.js
// A dedicated loopback origin and blocked API requests keep fixtures isolated.
state.page = await context.newPage();
await state.page.setViewportSize({ width: 390, height: 500 });
await state.page.clock.install({ time: new Date("2026-10-02T09:00:00Z") });
await state.page.route("**/api/**", route => route.abort());
await state.page.goto("http://127.0.0.1:5174", { waitUntil: "domcontentloaded" });
await state.page.getByRole("textbox", { name: "Что потратил или получил?" }).waitFor();

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const observe = async () => {
  console.log(await snapshot({ page: state.page, search: /heading|navigation|dialog/ }));
  console.log(await getLatestLogs({ page: state.page, sinceLastCall: true }));
  check(await state.page.locator(".screen:visible").count() === 1, "Exactly one screen must be visible");
};
const tab = async name => {
  await state.page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("link", { name, exact: true }).click();
  await observe();
};
const frames = () => state.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const scroll = async amount => {
  await state.page.locator(".screen:visible").evaluate((el, value) => { el.scrollTop = value; }, amount);
  await frames();
  return state.page.locator(".screen:visible").evaluate(el => el.scrollTop);
};
const sameScreen = async handle => check(await handle.evaluate(el => el.isConnected && el === document.querySelector(".tab-view:not([hidden]) .screen")), "Tab screen was recreated");

await state.page.evaluate(async () => {
  const { getServices } = await import("/src/state.ts");
  const { ledger } = await getServices();
  await ledger.device.clear();
  for (let i = 0; i < 20; i++) await ledger.submit(`кофе ${250 + i}`);
  await ledger.submit("такси 450");
});
await observe();
check(await state.page.locator(".tab-view .screen").count() === 1, "Unvisited tabs must not mount");
state.entryScreen = await state.page.locator(".screen:visible").elementHandle();
await state.page.getByRole("textbox", { name: "Что потратил или получил?" }).fill("неизвестнаяпокупка 123");
await observe();
state.entryScroll = await scroll(120);

await tab("Дашборд");
check(await state.page.locator(".tab-view .screen").count() === 2, "Settings must remain unmounted before its first visit");
state.dashboardScreen = await state.page.locator(".screen:visible").elementHandle();
await state.page.getByRole("button", { name: "Месяц", exact: true }).click();
await observe();
await state.page.locator(".cat-row").filter({ hasText: "Кафе" }).click();
await observe();
state.dashboardScroll = await scroll(160);

await tab("Настройки");
state.settingsScreen = await state.page.locator(".screen:visible").elementHandle();
await scroll(180);
await state.page.waitForTimeout(2700); // Wait past the inactive composer's category-picking deadline.
check(await state.page.getByRole("dialog").count() === 0, "Inactive Entry opened a category picker");
// Browser focus may scroll the menu to the clicked row before navigation.
await state.page.locator(".screen:visible").evaluate(el => {
  el.addEventListener("click", () => { window.settingsScrollAtNavigation = el.scrollTop; }, { capture: true, once: true });
});
await state.page.getByRole("link", { name: "Часовой пояс", exact: true }).click();
state.settingsScroll = await state.page.evaluate(() => window.settingsScrollAtNavigation);
check(state.settingsScroll > 0, "Settings scroll fixture must be nonzero");
await observe();
check(await state.settingsScreen.evaluate(el => el.isConnected), "Opening a Settings subpage destroyed its menu");
await state.page.getByRole("link", { name: "Назад", exact: true }).click();
await observe();
await sameScreen(state.settingsScreen);
check(await state.page.locator(".screen:visible").evaluate(el => el.scrollTop) === state.settingsScroll, "Settings scroll was lost");

await tab("Дашборд");
await sameScreen(state.dashboardScreen);
check(await state.page.getByRole("button", { name: "Месяц", exact: true }).getAttribute("aria-pressed") === "true", "Dashboard period mode was lost");
check(await state.page.locator(".cat-row").filter({ hasText: "Кафе" }).getAttribute("aria-expanded") === "true", "Expanded category was lost");
check(await state.page.locator(".screen:visible").evaluate(el => el.scrollTop) === state.dashboardScroll, "Dashboard scroll was lost");
check(await state.page.locator(".screen:visible .nav-bar-title").getAttribute("aria-hidden") === "false", "Collapsed Dashboard header was lost");

await tab("Ввод");
await sameScreen(state.entryScreen);
check(await state.page.getByRole("textbox", { name: "Что потратил или получил?" }).inputValue() === "неизвестнаяпокупка 123", "Entry draft was lost");
check(await state.page.locator(".screen:visible").evaluate(el => el.scrollTop) === state.entryScroll, "Entry scroll was lost");
await state.page.getByRole("textbox", { name: "Что потратил или получил?" }).fill("");
await observe();
await state.page.getByRole("button", { name: "Поиск", exact: true }).click();
await observe();
await state.page.getByRole("searchbox").fill("кофе");
await observe();
await tab("Настройки");
await sameScreen(state.settingsScreen);
await tab("Ввод");
await sameScreen(state.entryScreen);
check(await state.page.getByRole("searchbox").inputValue() === "кофе", "Entry search was lost");
await state.page.getByRole("button", { name: "Отмена", exact: true }).click();
await observe();
await state.page.getByRole("textbox", { name: "Что потратил или получил?" }).waitFor();
await tab("Настройки");
await state.page.clock.setSystemTime(new Date("2026-10-03T09:00:00Z"));
await tab("Ввод");
check(await state.page.locator(".day-head").first().textContent() === "Вчера−5 640 ₽", "Entry dates did not refresh on activation after midnight");
await tab("Дашборд");
check(await state.page.locator(".period-title").textContent() === "Октябрь 2026День 3 из 31", "Dashboard date did not refresh on activation after midnight");
console.log("PASS: tab instances, state, scroll, Settings menu and date refresh survive navigation; inactive picker stays closed");
await state.page.close();

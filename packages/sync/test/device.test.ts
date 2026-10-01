import "fake-indexeddb/auto"
import { indexedDbStore, LocalUserChanged, memoryStore, openLedger } from "@fin/ledger"
import { createAuthApi, createSync, createUserDevice, type Sync } from "@fin/sync"
import { afterEach, expect, it } from "vitest"
import { inProcessServer, PASSWORD, testClock, type InProcessServer } from "./support"

let server: InProcessServer | undefined
const running: Array<Sync> = []
afterEach(async () => {
  for (const sync of running.splice(0)) await sync.stop()
  await server?.close()
  server = undefined
})

const client = async (instance: InProcessServer) => {
  const browser = instance.device()
  const store = memoryStore()
  const ledger = await openLedger({ store })
  const auth = createAuthApi(browser.transport)
  const sync = createSync({ ledger, transport: browser.transport })
  running.push(sync)
  return { browser, store, ledger, auth, sync, device: createUserDevice({ ledger, auth, sync }) }
}

it.each([
  ["память", () => memoryStore()],
  ["IndexedDB", () => indexedDbStore(`device-${crypto.randomUUID()}`)]
] as const)("%s: принадлежность переживает перезапуск, очистка убирает очередь, курсор и расчёты", async (_name, makeStore) => {
  const store = makeStore()
  const ledger = await openLedger({ store })
  await ledger.submit("секрет 100", { categoryId: ledger.categories("expense")[0]!.id })
  await ledger.setPaydays([12])
  await ledger.setDashboardMode("month")
  await ledger.sync.receive([], 42)
  expect(ledger.days()).toHaveLength(1)
  const pending = ledger.pendingChanges().length
  await ledger.device.adopt("owner")
  const reopened = await openLedger({ store })
  expect(reopened.device.owner()).toBe("owner")
  expect(reopened.pendingChanges()).toHaveLength(pending)
  expect(reopened.sync.cursor()).toBe(42)
  await reopened.device.clear()
  expect(reopened.days()).toEqual([])
  expect(reopened.settings().paydays).toEqual([5, 20])
  expect(reopened.pendingChanges()).toEqual([])
  expect(reopened.sync.cursor()).toBe(0)
  expect(reopened.device.owner()).toBeNull()
  const empty = await openLedger({ store })
  expect(empty.days()).toEqual([])
  expect(empty.pendingChanges()).toEqual([])
  expect(empty.device.owner()).toBeNull()
})

it("первый вошедший пользователь присваивает прежние локальные данные без потери очереди", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const browser = server.device()
  const auth = createAuthApi(browser.transport)
  const result = await auth.login("owner", PASSWORD)
  if (!result.ok) throw new Error(result.reason)
  const store = memoryStore()
  const ledger = await openLedger({ store })
  await ledger.submit("секрет 100", { categoryId: ledger.categories("expense")[0]!.id })
  browser.online = false
  const sync = createSync({ ledger, transport: browser.transport })
  running.push(sync)
  const device = createUserDevice({ ledger, auth, sync })
  expect(await device.acceptUser(result.user)).toEqual({ ok: true, user: result.user })
  await sync.stop()
  expect(ledger.device.owner()).toBe(result.user.id)
  expect(ledger.pendingChanges()).toHaveLength(1)
  expect(ledger.days()).toHaveLength(1)
  const reopened = await openLedger({ store })
  expect(reopened.device.owner()).toBe(result.user.id)
  expect(reopened.pendingChanges()).toHaveLength(1)
})

it("обычный 401 сохраняет данные и очередь, повторный вход того же пользователя отправляет их", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const phone = await client(server)
  expect((await phone.device.login("owner", PASSWORD)).ok).toBe(true)
  await phone.sync.syncNow()
  phone.browser.online = false
  await phone.ledger.submit("секрет 100", { categoryId: phone.ledger.categories("expense")[0]!.id })
  const other = createAuthApi(server.device().transport)
  await other.login("owner", PASSWORD)
  const session = (await other.sessions())!.find((session) => !session.current)!
  expect(await other.revokeSession(session.id)).toBe(true)
  phone.browser.online = true
  expect(await phone.device.checkSession()).toEqual({ state: "signed-out" })
  expect(phone.ledger.days()).toHaveLength(1)
  expect(phone.ledger.pendingChanges()).toHaveLength(1)
  expect((await phone.device.login("owner", PASSWORD)).ok).toBe(true)
  expect(await phone.sync.syncNow()).toBe("ok")
  expect(phone.ledger.pendingChanges()).toEqual([])
  const computer = await client(server)
  await computer.device.login("owner", PASSWORD)
  await computer.sync.syncNow()
  expect(computer.ledger.days()[0]!.items[0]!.description).toBe("секрет")
})

it("смена пользователя ждёт подтверждения очереди и очищает все прежние данные до синхронизации", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const phone = await client(server)
  await phone.device.login("owner", PASSWORD)
  await phone.sync.syncNow()
  const invitation = await phone.auth.createInvitation()
  if (!invitation.ok) throw new Error(invitation.reason)
  const friend = await client(server)
  expect((await friend.device.register(invitation.value.token, "friend", "пароль-друга")).ok).toBe(true)
  phone.browser.online = false
  await phone.ledger.submit("секрет 100", { categoryId: phone.ledger.categories("expense")[0]!.id })
  await phone.ledger.setPaydays([12])
  await phone.ledger.addCategory("expense", "Только владельца")
  await phone.ledger.addGoal({ name: "Секретная цель", icon: "star", target: 10000 })
  const pending = phone.ledger.pendingChanges().length
  phone.browser.online = true
  const result = await phone.device.login("friend", "пароль-друга")
  expect(result).toMatchObject({ ok: false, reason: "pending-changes", pending, user: { login: "friend" } })
  expect(phone.device.state()).toEqual({ state: "signed-out" })
  expect(phone.ledger.days()).toHaveLength(1)
  expect(phone.ledger.pendingChanges()).toHaveLength(pending)
  if (result.ok || result.reason !== "pending-changes") throw new Error("нужно предупреждение")
  expect((await phone.device.acceptUser(result.user, { confirmDiscard: true })).ok).toBe(true)
  expect(phone.ledger.days()).toEqual([])
  expect(phone.ledger.goals()).toEqual([])
  expect(phone.ledger.settings().paydays).toEqual([5, 20])
  expect(phone.ledger.categories("expense").some((category) => category.name === "Только владельца")).toBe(false)
  expect(phone.ledger.pendingChanges()).toEqual([])
  expect(phone.ledger.dashboardMode()).toBe("month")
  await phone.sync.syncNow()
  await friend.sync.syncNow()
  expect(friend.ledger.days()).toEqual([])
  expect(friend.ledger.settings().paydays).toEqual([5, 20])
})

it("подтверждённый выход закрывает сессию и полностью очищает устройство", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const phone = await client(server)
  await phone.device.login("owner", PASSWORD)
  await phone.sync.syncNow()
  phone.browser.online = false
  await phone.ledger.submit("секрет 100", { categoryId: phone.ledger.categories("expense")[0]!.id })
  expect(await phone.device.logout()).toEqual({ ok: false, reason: "pending-changes", pending: 1 })
  expect(phone.ledger.days()).toHaveLength(1)
  phone.browser.online = true
  expect(await phone.device.logout({ confirmDiscard: true })).toEqual({ ok: true })
  expect(await phone.auth.checkSession()).toBe("signed-out")
  expect(phone.ledger.days()).toEqual([])
  expect(phone.ledger.pendingChanges()).toEqual([])
  const reopened = await openLedger({ store: phone.store })
  expect(reopened.device.owner()).toBeNull()
  expect(reopened.days()).toEqual([])
  expect(reopened.sync.cursor()).toBe(0)
})

it("сброс пароля сохраняет локальную очередь того же пользователя и продолжает синхронизацию", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const owner = createAuthApi(server.device().transport)
  await owner.login("owner", PASSWORD)
  const invitation = await owner.createInvitation()
  if (!invitation.ok) throw new Error(invitation.reason)
  const phone = await client(server)
  const registration = await phone.device.register(invitation.value.token, "friend", "пароль-друга")
  if (!registration.ok) throw new Error(registration.reason)
  await phone.sync.syncNow()
  phone.browser.online = false
  await phone.ledger.submit("сохранить 100", { categoryId: phone.ledger.categories("expense")[0]!.id })
  const reset = await owner.createPasswordReset(registration.user.id)
  if (!reset.ok) throw new Error(reset.reason)
  expect(await owner.resetLink(reset.value.token)).toMatchObject({ ok: true, value: { login: "friend" } })
  phone.browser.online = true
  const result = await phone.device.resetPassword(reset.value.token, "новый-пароль")
  expect(result).toMatchObject({ ok: true, user: { id: registration.user.id } })
  expect(phone.ledger.days()).toHaveLength(1)
  expect(await phone.sync.syncNow()).toBe("ok")
  expect(phone.ledger.pendingChanges()).toEqual([])
  const computer = await client(server)
  await computer.device.login("friend", "новый-пароль")
  await computer.sync.syncNow()
  expect(computer.ledger.days()[0]!.items[0]!.description).toBe("сохранить")
  expect(await phone.auth.resetPassword(reset.value.token, "ещё-пароль")).toEqual({ ok: false, reason: "reset-used" })
})

it("удалённый пользователь получает 410 и устройство стирает данные и очередь", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const owner = createAuthApi(server.device().transport)
  await owner.login("owner", PASSWORD)
  const invitation = await owner.createInvitation()
  if (!invitation.ok) throw new Error(invitation.reason)
  const phone = await client(server)
  const result = await phone.device.register(invitation.value.token, "friend", "пароль-друга")
  if (!result.ok) throw new Error(result.reason)
  await phone.sync.syncNow()
  phone.browser.online = false
  await phone.sync.stop()
  await phone.ledger.submit("секрет 100", { categoryId: phone.ledger.categories("expense")[0]!.id })
  expect((await owner.deleteUser(result.user.id)).ok).toBe(true)
  phone.browser.online = true
  expect(await phone.sync.syncNow()).toBe("user-deleted")
  expect(phone.sync.status().state).toBe("user-deleted")
  phone.browser.online = false
  expect(await phone.device.checkSession()).toEqual({ state: "user-deleted" })
  expect(phone.ledger.pendingChanges()).toEqual([])
  expect(phone.ledger.days()).toEqual([])
  expect(phone.ledger.sync.cursor()).toBe(0)
  expect((await openLedger({ store: phone.store })).device.owner()).toBeNull()
})

it("смена cookie в другой вкладке не отправляет прежнюю очередь новому пользователю", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const ownerTab = await client(server)
  await ownerTab.device.login("owner", PASSWORD)
  await ownerTab.sync.syncNow()
  const invitation = await ownerTab.auth.createInvitation()
  if (!invitation.ok) throw new Error(invitation.reason)
  const friend = await client(server)
  await friend.device.register(invitation.value.token, "friend", "пароль-друга")
  await ownerTab.sync.stop()
  await ownerTab.ledger.submit("секрет 100", { categoryId: ownerTab.ledger.categories("expense")[0]!.id })
  // Cookie общая у вкладок, IndexedDB первой вкладки ещё принадлежит владельцу.
  await ownerTab.auth.login("friend", "пароль-друга")
  expect(await ownerTab.sync.syncNow()).toBe("unauthorized")
  expect(ownerTab.ledger.pendingChanges()).toHaveLength(1)
  await friend.sync.syncNow()
  expect(friend.ledger.days()).toEqual([])
  expect(await ownerTab.device.checkSession()).toEqual({ state: "signed-out" })
  expect(ownerTab.ledger.days()).toHaveLength(1)
})

it.each(["память", "IndexedDB"])("%s: прежняя вкладка не добавляет записи в хранилище нового пользователя", async (kind) => {
  const name = `shared-device-${crypto.randomUUID()}`
  const memory = memoryStore()
  const firstStore = kind === "память" ? memory : indexedDbStore(name)
  const secondStore = kind === "память" ? memory : indexedDbStore(name)
  const oldTab = await openLedger({ store: firstStore })
  await oldTab.device.adopt("owner")
  const newTab = await openLedger({ store: secondStore })
  await newTab.device.clear()
  await newTab.device.adopt("friend")
  await newTab.submit("друга 200", { categoryId: newTab.categories("expense")[0]!.id })
  await expect(oldTab.submit("секрет 100", { categoryId: oldTab.categories("expense")[0]!.id })).rejects.toBeInstanceOf(LocalUserChanged)
  await expect(oldTab.device.clear()).rejects.toBeInstanceOf(LocalUserChanged)
  await expect(oldTab.device.adopt("friend")).rejects.toBeInstanceOf(LocalUserChanged)
  const reopened = await openLedger({ store: secondStore })
  expect(reopened.device.owner()).toBe("friend")
  expect(reopened.days()[0]!.items.map((operation) => operation.description)).toEqual(["друга"])
  expect(reopened.pendingChanges()).toHaveLength(1)
})

it("удаление очищает устройство даже после исчезновения сессионной cookie", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const owner = createAuthApi(server.device().transport)
  await owner.login("owner", PASSWORD)
  const invitation = await owner.createInvitation()
  if (!invitation.ok) throw new Error(invitation.reason)
  const phone = await client(server)
  const registration = await phone.device.register(invitation.value.token, "friend", "пароль-друга")
  if (!registration.ok) throw new Error(registration.reason)
  await phone.sync.stop()
  await phone.ledger.submit("секрет 100", { categoryId: phone.ledger.categories("expense")[0]!.id })
  // Только cookie пропала, локальные данные и владелец устройства остаются.
  await phone.auth.logout()
  expect((await owner.deleteUser(registration.user.id)).ok).toBe(true)
  expect(await phone.device.checkSession()).toEqual({ state: "user-deleted" })
  expect(phone.ledger.days()).toEqual([])
  expect(phone.ledger.pendingChanges()).toEqual([])
  expect(phone.ledger.device.owner()).toBeNull()
})

it("выход без сети сохраняет данные и очередь до подтверждённого сервером закрытия сессии", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const phone = await client(server)
  await phone.device.login("owner", PASSWORD)
  await phone.sync.syncNow()
  const session = phone.device.state()
  phone.browser.online = false
  await phone.ledger.submit("сохранить 100", { categoryId: phone.ledger.categories("expense")[0]!.id })
  expect(await phone.device.logout({ confirmDiscard: true })).toEqual({ ok: false, reason: "offline" })
  expect(phone.device.state()).toEqual(session)
  expect(phone.ledger.days()).toHaveLength(1)
  expect(phone.ledger.pendingChanges()).toHaveLength(1)
  const persisted = await openLedger({ store: phone.store })
  expect(persisted.device.owner()).toBe("owner")
  expect(persisted.pendingChanges()).toHaveLength(1)
  phone.browser.online = true
  expect(await phone.device.logout({ confirmDiscard: true })).toEqual({ ok: true })
  expect(await phone.auth.me()).toEqual({ state: "signed-out" })
  expect(phone.ledger.device.owner()).toBeNull()
  expect(phone.ledger.days()).toEqual([])
  expect(phone.ledger.pendingChanges()).toEqual([])
})

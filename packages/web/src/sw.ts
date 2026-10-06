/// <reference lib="webworker" />
/**
 * Service worker: оболочка приложения из кэша, поэтому холодный запуск работает без сети.
 * Версия и список файлов подставляются при сборке. Новая версия скачивается в фоне и ждёт
 * закрытия всех окон приложения. При активации удаляется старый кэш; следующий запуск — новый.
 */
declare const __VERSION__: string
declare const __PRECACHE__: ReadonlyArray<string>

const sw = self as unknown as ServiceWorkerGlobalScope

const SHELL = `shell-${__VERSION__}`

sw.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(__PRECACHE__.map((url) => new Request(url, { cache: "reload" }))))
  )
})

sw.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
  )
})

const cacheFirst = async (cacheName: string, request: Request) => {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok || response.type === "opaque") void cache.put(request, response.clone())
  return response
}

sw.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)

  if (url.origin !== sw.location.origin || url.pathname.startsWith("/api/")) return

  // экраны приложения — всегда оболочка из кэша
  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => (await cache.match("/index.html")) ?? fetch(request))
    )
    return
  }
  event.respondWith(cacheFirst(SHELL, request))
})

import { Effect } from "effect"
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"

const PARAMS = { N: 16384, r: 8, p: 1 }
const KEY_LENGTH = 32

const derive = (password: string, salt: Buffer, options: ScryptOptions) =>
  Effect.async<Buffer>((resume) => {
    scrypt(password.normalize("NFC"), salt, KEY_LENGTH, options, (error, key) =>
      resume(error ? Effect.die(error) : Effect.succeed(key))
    )
  })

/** Хэш пароля: `scrypt$N$r$p$соль$хэш`. */
export const hashPassword = (password: string) =>
  Effect.gen(function* () {
    const salt = randomBytes(16)
    const key = yield* derive(password, salt, PARAMS)
    return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$")
  })

export const verifyPassword = (password: string, stored: string) =>
  Effect.gen(function* () {
    const [scheme, n, r, p, salt, hash] = stored.split("$")
    if (scheme !== "scrypt" || !salt || !hash) return false
    const expected = Buffer.from(hash, "base64")
    const key = yield* derive(password, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p) })
    return key.length === expected.length && timingSafeEqual(key, expected)
  })

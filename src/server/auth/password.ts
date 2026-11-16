import { hash, verify } from "@node-rs/argon2";

// Strong defaults (OWASP argon2id). Tests set ARGON2_CHEAP=1 to keep the machine responsive.
const cheap = process.env.ARGON2_CHEAP === "1";
const options = cheap
  ? { memoryCost: 1024, timeCost: 1, parallelism: 1 }
  : { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const PASSWORD_MIN = 10;

export function hashPassword(password: string) {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Used when the email is unknown, so response time does not reveal which emails exist.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword("not-a-real-password-placeholder");
  await verifyPassword(await dummyHash, password);
}

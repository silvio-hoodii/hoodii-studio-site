/* The public half of the Web Push key pair. Public by design: every browser that subscribes is
 * handed it. The private half is VAPID_PRIVATE_KEY, in .env.local and in Vercel production only. */
export const VAPID_PUBLIC_KEY =
  'BNCTgmbOD8W7WcVg0FKTraCYDC8emPlLAvG-vsYS1MGrF6sVpZPpGQu0hn2icO7Q2QUwf8f9uKMuzU1_jbTniUE';

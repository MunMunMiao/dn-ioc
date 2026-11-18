import { provide } from 'dn-ioc'

export const configRef = provide(() => ({ greeting: 'hello' })) // [!hl]

export const greeterRef = provide(({ inject }) => {
  const config = inject(configRef) // [!hl]
  return {
    greet: (name: string) => `${config.greeting}, ${name}`,
  }
})

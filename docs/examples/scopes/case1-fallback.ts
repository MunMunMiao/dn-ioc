import { bootstrapApp, provide, provideFor, token } from 'dn-ioc'

export const labelToken = token<string>('Label')

export const rendererRef = provide(({ inject }) => ({
  label: inject(labelToken),
}))

export const previewRef = provide(({ inject }) => inject(rendererRef), {
  providers: [
    rendererRef, // [!hl]
  ],
})

export const app = bootstrapApp(
  ({ inject }) => {
    console.log(inject(previewRef).label) // app // [!hl]
    console.log(inject(rendererRef).label) // app
  },
  {
    providers: [
      provideFor(labelToken, () => 'app'), // [!hl]
    ],
  },
)

await app.start()
await app.stop()

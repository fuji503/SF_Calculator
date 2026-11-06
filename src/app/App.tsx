import { useCallback, useState } from 'react'
import { ChangelogScreen } from '../screens/ChangelogScreen.tsx'
import { HowToScreen } from '../screens/HowToScreen.tsx'
import { LicenseScreen } from '../screens/LicenseScreen.tsx'
import { NotFoundScreen } from '../screens/NotFoundScreen.tsx'
import { SimScreen } from '../screens/SimScreen.tsx'
import { TopScreen } from '../screens/TopScreen.tsx'
import { findSimModule } from '../sims/registry.ts'
import { Drawer } from './Drawer.tsx'
import { Header } from './Header.tsx'
import type { Route } from './route.ts'
import { useHashRoute } from './useHashRoute.ts'

export default function App() {
  const route = useHashRoute()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <div className="min-h-dvh">
      <Header onOpenMenu={() => setMenuOpen(true)} />
      <Drawer open={menuOpen} current={route} onClose={closeMenu} />
      <main className="mx-auto w-full max-w-[1100px] px-3 py-4 md:px-6 md:py-8">
        <Screen route={route} />
      </main>
    </div>
  )
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'top':
      return <TopScreen />
    case 'sim': {
      const sim = findSimModule(route.id)
      return sim ? <SimScreen key={sim.id} sim={sim} /> : <NotFoundScreen />
    }
    case 'howTo':
      return <HowToScreen />
    case 'changelog':
      return <ChangelogScreen />
    case 'license':
      return <LicenseScreen />
    case 'notFound':
      return <NotFoundScreen />
  }
}

import { Outlet } from 'react-router'

import EnsureAdminGuard from './ensure-admin'
import InitGuard from './init'
import RequireAuthGuard from './require-auth'

export default function GlobalGuard() {
  return (
    <EnsureAdminGuard>
      <InitGuard>
        <RequireAuthGuard>
          <Outlet />
        </RequireAuthGuard>
      </InitGuard>
    </EnsureAdminGuard>
  )
}

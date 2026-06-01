import { Outlet } from 'react-router'

import EnsureAdminGuard from './ensure-admin'
import InitGuard from './init'
import RequireAdminGuard from './require-admin'
import RequireAuthGuard from './require-auth'

export default function GlobalGuard() {
  return (
    <EnsureAdminGuard>
      <InitGuard>
        <RequireAuthGuard>
          <RequireAdminGuard>
            <Outlet />
          </RequireAdminGuard>
        </RequireAuthGuard>
      </InitGuard>
    </EnsureAdminGuard>
  )
}

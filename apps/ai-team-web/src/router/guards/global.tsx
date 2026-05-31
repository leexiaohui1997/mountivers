import { Outlet } from 'react-router'

import EnsureAdminGuard from './ensure-admin'
import RequireAuthGuard from './require-auth'

export default function GlobalGuard() {
  return (
    <EnsureAdminGuard>
      <RequireAuthGuard>
        <Outlet />
      </RequireAuthGuard>
    </EnsureAdminGuard>
  )
}

import { Outlet } from 'react-router'

import EnsureAdminGuard from './ensure-admin'

export default function GlobalGuard() {
  return (
    <EnsureAdminGuard>
      <Outlet />
    </EnsureAdminGuard>
  )
}

import type { RouteHandle } from '../type'
import type { RouteObject } from 'react-router'

export const ADMIN_ROUTES: RouteObject[] = [
  {
    path: '/admin',
    handle: {
      requireAuth: true,
      requireAdmin: true,
    } satisfies RouteHandle,
    children: [
      {
        index: true,
        element: <div>Admin</div>,
      },
    ],
  },
]

import { createBrowserRouter } from 'react-router'

import GlobalGuard from './guards/global'
import { ADMIN_ROUTES } from './modules/admin'
import { BASE_ROUTES } from './modules/base'

import type { RouteHandle } from './type'

export const router = createBrowserRouter([
  {
    element: <GlobalGuard />,
    children: [
      {
        path: '/',
        element: <div>Home</div>,
        handle: {
          requireAuth: true,
        } satisfies RouteHandle,
      },
      ...ADMIN_ROUTES,
      ...BASE_ROUTES,
    ],
  },
])

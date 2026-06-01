import { createBrowserRouter } from 'react-router'

import { InitAdmin, Login } from './components'
import GlobalGuard from './guards/global'

export type RouteHandle = {
  requireAuth?: boolean
}

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
      {
        path: '/init/admin',
        element: <InitAdmin />,
      },
      {
        path: '/login',
        element: <Login />,
      },
    ],
  },
])

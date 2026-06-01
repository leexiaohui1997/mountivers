import { InitAdmin, Login } from '../components'

import type { RouteObject } from 'react-router'

import NotFound from '@/components/NotFound'

export const BASE_ROUTES: RouteObject[] = [
  {
    path: '/init/admin',
    element: <InitAdmin />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
]

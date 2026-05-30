import { createBrowserRouter } from 'react-router'

import { globalRouteLoader } from './loaders'

export const router = createBrowserRouter([
  {
    path: '/',
    loader: globalRouteLoader,
    children: [
      {
        index: true,
        element: <div>Home</div>,
      },
      {
        path: 'init/admin',
        element: <div>Init Admin</div>,
      },
    ],
  },
])

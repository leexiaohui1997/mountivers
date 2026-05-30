import { createBrowserRouter } from 'react-router'

import { InitAdmin } from './components'
import GlobalGuard from './guards/global'

export const router = createBrowserRouter([
  {
    element: <GlobalGuard />,
    children: [
      {
        path: '/',
        element: <div>Home</div>,
      },
      {
        path: 'init/admin',
        element: <InitAdmin />,
      },
    ],
  },
])

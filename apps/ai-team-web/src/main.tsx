import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as ReduxProvider } from 'react-redux'
import { RouterProvider } from 'react-router/dom'

import { THEME } from './constants/theme.ts'
import { router } from './router/index.tsx'
import { store } from './stores/index.ts'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={THEME}>
      <ReduxProvider store={store}>
        <App className="h-full">
          <RouterProvider router={router} />
        </App>
      </ReduxProvider>
    </ConfigProvider>
  </StrictMode>,
)

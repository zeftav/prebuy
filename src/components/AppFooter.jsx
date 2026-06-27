// App-wide footer: the version/build stamp + the "What's new" control. Rendered
// once globally (see App.jsx) so every in-app page carries it — not just Home.
// Hidden on the public customer report (that's not an in-app page).

import WhatsNew from './WhatsNew.jsx'
import { APP_VERSION, BUILD_SHA } from '../lib/version.js'
import './AppFooter.css'

export default function AppFooter() {
  return (
    <footer className="appfooter">
      <span className="appfooter__build">
        v{APP_VERSION} · build {BUILD_SHA}
      </span>
      <WhatsNew />
    </footer>
  )
}

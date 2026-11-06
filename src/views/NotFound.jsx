import { Compass } from 'lucide-react'
import { Link } from '../router.jsx'
import { EmptyState, PageHeader } from '../components/ui.jsx'

export default function NotFound({ text = 'Diese Seite gibt es nicht.' }) {
  return (
    <div className="page">
      <PageHeader title="" back="/" />
      <EmptyState icon={Compass} title="Nicht gefunden" text={text} action={<Link to="/" className="btn primary">Zur Startseite</Link>} />
    </div>
  )
}

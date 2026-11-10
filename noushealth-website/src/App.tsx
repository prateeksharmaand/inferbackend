import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import Home from './pages/Home'

const Services = lazy(() => import('./pages/Services'))
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'))
const Solutions = lazy(() => import('./pages/Solutions'))
const Industries = lazy(() => import('./pages/Industries'))
const About = lazy(() => import('./pages/About'))
const CaseStudies = lazy(() => import('./pages/CaseStudies'))
const CaseStudyDetail = lazy(() => import('./pages/CaseStudyDetail'))
const Insights = lazy(() => import('./pages/Insights'))
const ArticleDetail = lazy(() => import('./pages/ArticleDetail'))
const Contact = lazy(() => import('./pages/Contact'))
const NotFound = lazy(() => import('./pages/NotFound'))

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink" aria-busy="true" />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="services" element={<Services />} />
          <Route path="services/:slug" element={<ServiceDetail />} />
          <Route path="solutions" element={<Solutions />} />
          <Route path="industries" element={<Industries />} />
          <Route path="about" element={<About />} />
          <Route path="case-studies" element={<CaseStudies />} />
          <Route path="case-studies/:slug" element={<CaseStudyDetail />} />
          <Route path="insights" element={<Insights />} />
          <Route path="insights/:slug" element={<ArticleDetail />} />
          <Route path="contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

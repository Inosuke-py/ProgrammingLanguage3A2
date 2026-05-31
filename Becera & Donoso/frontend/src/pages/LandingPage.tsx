import Navbar from '../components/landing/Navbar'
import Hero from '../components/landing/Hero'
import Features from '../components/landing/Features'
import HowItWorks from '../components/landing/HowItWorks'
import FAQ from '../components/landing/FAQ'
import FooterCTA from '../components/landing/FooterCTA'
import Footer from '../components/landing/Footer'
import { theme } from '../theme'

export default function LandingPage() {
  return (
    <div className="min-h-screen relative" style={{ background: theme.bg }}>
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <FAQ />
      <FooterCTA />
      <Footer />
    </div>
  )
}

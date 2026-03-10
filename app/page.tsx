'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Navbar } from '@/components/navbar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Search,
  Shield,
  Cpu,
  Link2,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Zap,
  Globe,
  Lock,
  Users,
  TrendingUp
} from 'lucide-react'

export default function Home() {
  const [user, setUser] = useState<{ fullName: string } | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        setUser(JSON.parse(userStr))
      } catch (e) {
        console.error('Error parsing user from localStorage', e)
      }
    }
    setIsLoaded(true)
  }, [])

  const features = [
    {
      icon: Cpu,
      title: 'AI-Powered Detection',
      description: 'Advanced computer vision algorithms analyze uploaded images to identify and categorize items with high accuracy.',
      gradient: 'from-violet-500 to-purple-500'
    },
    {
      icon: Link2,
      title: 'Blockchain Verified',
      description: 'Every match is recorded on the blockchain, ensuring transparent and tamper-proof verification of ownership claims.',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: Search,
      title: 'Smart Matching',
      description: 'Our intelligent matching system compares lost and found items to find potential matches with confidence scores.',
      gradient: 'from-emerald-500 to-teal-500'
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      description: 'Your data is protected with enterprise-grade security. Only verified matches are shared between parties.',
      gradient: 'from-orange-500 to-amber-500'
    }
  ]

  const stats = [
    { value: '10K+', label: 'Items Recovered', icon: CheckCircle2 },
    { value: '50K+', label: 'Active Users', icon: Users },
    { value: '95%', label: 'Match Accuracy', icon: TrendingUp },
    { value: '24/7', label: 'AI Processing', icon: Zap }
  ]

  const howItWorks = [
    {
      step: '01',
      title: 'Upload Photo',
      description: 'Take a clear photo of your lost or found item and upload it to our platform.'
    },
    {
      step: '02',
      title: 'AI Analysis',
      description: 'Our AI analyzes the image to detect item type, features, and unique characteristics.'
    },
    {
      step: '03',
      title: 'Smart Matching',
      description: 'The system searches our database for potential matches using advanced algorithms.'
    },
    {
      step: '04',
      title: 'Blockchain Record',
      description: 'Matches are verified and recorded on the blockchain for transparency and trust.'
    }
  ]

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Animated background gradients */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-violet-500/30 to-purple-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-tr from-blue-500/30 to-cyan-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-full blur-3xl" />
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.03)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:py-24 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 mb-8">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-medium bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent">
              Powered by AI & Blockchain Technology
            </span>
          </div>

          {/* Main heading */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
            LostLink: Blockchain
            </span>
            <br />
            <span className="bg-gradient-to-r from-violet-500 via-purple-500 to-blue-500 bg-clip-text text-transparent">
             Based Lost and Found
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed">
           
            <span className="text-foreground font-medium"> blockchain verification </span>
            to help you recover what&apos;s yours.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            {user ? (
              <>
                <Link href="/upload?type=lost">
                  <Button size="lg" className="h-14 px-8 text-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/25 group">
                    Report Lost Item
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/upload?type=found">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-2 hover:bg-accent group">
                    Report Found Item
                    <Search className="ml-2 w-5 h-5 group-hover:scale-110 transition-transform" />
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/register">
                  <Button size="lg" className="h-14 px-8 text-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/25 group">
                    Get Started Free
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/signin">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-2 hover:bg-accent">
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap justify-center items-center gap-8 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-500" />
              <span className="text-sm">Secure & Private</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-500" />
              <span className="text-sm">Global Network</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <span className="text-sm">Instant Matching</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center group">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 mb-4 group-hover:scale-110 transition-transform">
                  <stat.icon className="w-6 h-6 text-violet-500" />
                </div>
                <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
        <div className="relative z-10 mx-auto max-w-7xl px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Why Choose Our Platform?
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Combining cutting-edge AI with blockchain technology to create the most reliable lost and found system ever built.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="p-8 bg-card/50 backdrop-blur border-border/50 hover:border-violet-500/50 transition-all duration-300 group hover:shadow-lg hover:shadow-violet-500/5">
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} mb-6 group-hover:scale-110 transition-transform shadow-lg`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                How It Works
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Four simple steps to recover your lost items or help others find theirs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {howItWorks.map((step, index) => (
              <div key={index} className="relative group">
                {/* Connector line */}
                {index < howItWorks.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-[60%] w-[calc(100%-20px)] h-0.5 bg-gradient-to-r from-violet-500/50 to-transparent" />
                )}
                <div className="relative bg-card rounded-2xl p-6 border border-border/50 hover:border-violet-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/5">
                  <div className="text-5xl font-bold bg-gradient-to-br from-violet-500/20 to-purple-500/10 bg-clip-text text-transparent mb-4">
                    {step.step}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600/90 to-purple-600/90" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            Join thousands of users who have successfully recovered their lost items using our AI-powered blockchain platform.
          </p>
          {user ? (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/upload?type=lost">
                <Button size="lg" className="h-14 px-8 text-lg bg-white text-violet-600 hover:bg-white/90 shadow-lg group">
                  Report Lost Item
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/upload?type=found">
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-2 border-white text-white hover:bg-white/10">
                  Report Found Item
                </Button>
              </Link>
            </div>
          ) : (
            <Link href="/register">
              <Button size="lg" className="h-14 px-8 text-lg bg-white text-violet-600 hover:bg-white/90 shadow-lg group">
                Create Free Account
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-lg font-semibold bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent">
              Blockchain Lost & Found
            </div>
            <div className="text-sm text-muted-foreground">
               2026 All rights reserved. Powered by AI & Blockchain.
              Developed as a Final Year Project by Batch -19
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}


import {
  ArrowRight,
  BookOpen,
  Bookmark,
  CircleCheck,
  Compass,
  FlaskConical,
  Handshake,
  Inbox,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react'
import { ButtonLink } from '../components/ui/Button'
import { Avatar, Badge } from '../components/ui/display'
import { SkillTag } from '../components/tags'
import { useAuth } from '../features/auth/AuthContext'
import { useDocumentTitle } from '../hooks/misc'

// Illustrative only: these are clearly labelled example profiles, not real users.
const EXAMPLE_PEOPLE = [
  {
    name: 'Example: Frontend developer',
    headline: 'React, TypeScript, design systems',
    skills: ['React', 'TypeScript', 'Figma'],
    reasons: ['Covers missing skills: Figma', 'Brings design expertise your team lacks'],
    score: 78,
  },
  {
    name: 'Example: ML researcher',
    headline: 'NLP and evaluation',
    skills: ['Python', 'PyTorch', 'NLP'],
    reasons: ['Wants a role you need: ML/AI engineer', 'Shares interests: Health'],
    score: 71,
  },
]

const FEATURES = [
  { icon: Users, title: 'Complementary matching', body: 'Suggestions favour people who cover the skills and roles your team is missing, and every match explains why.' },
  { icon: Trophy, title: 'Hackathon discovery', body: 'Browse hackathons with dates, deadlines and format, then start or join a team for that event.' },
  { icon: FlaskConical, title: 'Research discovery', body: 'Search scholarly works from OpenAlex and Crossref, and find members with related research interests.' },
  { icon: Handshake, title: 'Projects and teams', body: 'Post a project, review join requests, invite people, and keep team size and status up to date.' },
  { icon: MessageSquare, title: 'Messaging', body: 'Direct conversations and team chats with read receipts, limited to people who are allowed to contact you.' },
  { icon: ShieldCheck, title: 'Privacy controls', body: 'Your email is never shown. Choose who can see your profile and who can message you.' },
]

const STEPS = [
  { icon: UserPlus, title: 'Create a profile', body: 'Add your skills, interests, preferred roles and availability. It takes a few minutes.' },
  { icon: Compass, title: 'Discover', body: 'Explore teammates, projects, hackathons and research opportunities, with filters that matter.' },
  { icon: Inbox, title: 'Connect and build', body: 'Request to join or invite people, chat with your team, and track everything in one place.' },
]

const HIGHLIGHTS = [
  { icon: Trophy, title: 'Hackathons', body: 'Curated listings link to official registration pages. Filter by upcoming, ongoing, online or in person, and sort by deadline.', to: '/opportunities?tab=hackathon', cta: 'Browse hackathons' },
  { icon: BookOpen, title: 'Research', body: 'Search papers by title, topic or author, open the original publication, save what matters, and post collaboration calls.', to: '/research', cta: 'Search research' },
  { icon: Sparkles, title: 'Project collaboration', body: 'Find recruiting student projects and open-source tasks labelled "good first issue" on GitHub.', to: '/opportunities?tab=project', cta: 'Find projects' },
]

export default function LandingPage() {
  useDocumentTitle(undefined)
  const { status } = useAuth()
  const signedIn = status === 'authenticated'

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <p className="eyebrow">For students, developers and researchers</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-fg sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
              Find the teammates your project is missing.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              HackMate connects you with people whose skills complement yours, and with the hackathons, projects and
              research opportunities worth building for.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to={signedIn ? '/people' : '/signup?next=/people'} size="lg" icon={<Users className="size-5" aria-hidden="true" />}>
                Find Teammates
              </ButtonLink>
              <ButtonLink to="/opportunities" size="lg" variant="secondary" icon={<Compass className="size-5" aria-hidden="true" />}>
                Explore Opportunities
              </ButtonLink>
            </div>
            <p className="mt-5 text-sm text-subtle">Free to use. Your email stays private.</p>
          </div>

          {/* Product preview */}
          <div className="relative" aria-label="Example of teammate suggestions">
            <div className="card p-5 shadow-2xl shadow-black/30">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-fg">Suggested for “Campus Carbon Tracker”</p>
                <Badge tone="warning">Example</Badge>
              </div>
              <ul className="space-y-3">
                {EXAMPLE_PEOPLE.map((person) => (
                  <li key={person.name} className="rounded-xl border border-line bg-surface-2/60 p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={person.name.replace('Example: ', '')} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-fg">{person.name}</p>
                          <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">{person.score}/100</span>
                        </div>
                        <p className="text-xs text-subtle">{person.headline}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {person.skills.map((skill) => <SkillTag key={skill}>{skill}</SkillTag>)}
                        </div>
                        <ul className="mt-2.5 space-y-1">
                          {person.reasons.map((reason) => (
                            <li key={reason} className="flex gap-1.5 text-xs text-muted">
                              <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-subtle">
                Illustration of how suggestions look. Real scores come from HackMate's transparent, rule-based matcher.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <p className="eyebrow">Features</p>
          <h2 className="mt-3 text-3xl font-bold text-fg">Everything you need to go from idea to team</h2>
          <p className="mt-3 text-muted">Built around how student and early-career teams actually form: around a project, an event or a research question.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-fg">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-line bg-surface/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 text-3xl font-bold text-fg">Three steps to your next team</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full border border-brand-400/40 bg-brand-500/10 text-sm font-bold text-brand-200">
                    {index + 1}
                  </span>
                  <Icon className="size-5 text-subtle" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold text-fg">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, body, to, cta }) => (
            <div key={title} className="card flex flex-col p-6">
              <Icon className="size-6 text-brand-300" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-fg">{title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{body}</p>
              <ButtonLink to={to} variant="ghost" size="sm" className="mt-5 -ml-3 self-start text-brand-300 hover:text-brand-200">
                {cta} <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-surface/60 p-5 text-sm text-muted">
          <Bookmark className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
          <p>
            Where data comes from: research metadata is fetched live from OpenAlex and Crossref, and open-source tasks from
            the GitHub API. Hackathons come from listings curated by HackMate admins or from feeds published by organizers.
            Anything labelled “Demo data” is a sample for demonstration.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="card flex flex-col items-start gap-6 border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-fg sm:text-3xl">Ready to build your team?</h2>
            <p className="mt-2 max-w-xl text-muted">Create a profile and get explained teammate suggestions straight away.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to={signedIn ? '/people' : '/signup?next=/people'} size="lg">Find Teammates</ButtonLink>
            <ButtonLink to="/opportunities" size="lg" variant="secondary">Explore Opportunities</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}

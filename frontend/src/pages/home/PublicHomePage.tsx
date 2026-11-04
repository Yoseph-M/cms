import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Boxes, CircleDollarSign, ClipboardList, Store, UsersRound, Zap } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { buttonVariants } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

const roleHome: Record<string, string> = { OWNER: '/owner', MANAGER: '/manager', CASHIER: '/cashier' };

const features = [
  { icon: Zap, title: 'Quick checkout', text: 'Search the catalog, apply customer pricing, take split payments, and print a clear receipt.' },
  { icon: Boxes, title: 'Inventory that follows sales', text: 'Track stock, supplier deliveries, low levels, and every adjustment in one history.' },
  { icon: UsersRound, title: 'Customer relationships', text: 'Keep useful profiles, customer pricing, and purchase history beside the counter.' },
  { icon: BarChart3, title: 'Reports that guide the next step', text: 'Review sales, best sellers, margins, expenses, and daily close reconciliation.' },
  { icon: CircleDollarSign, title: 'Finance and operations', text: 'Record expenses and payments, follow cash flow, and keep end-of-day work clear.' },
];

export const PublicHomePage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (isAuthenticated && user && roleHome[user.role]) return <Navigate to={roleHome[user.role]} replace />;

  return <div className="min-h-screen overflow-hidden bg-[hsl(var(--canvas-warm))] text-foreground">
    <header className="relative z-10 border-b border-border/60 bg-card/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Store className="h-5 w-5" /></span>MELEኛ<span className="-ml-2 text-primary">POS</span></Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground tablet-portrait:flex"><a href="#features" className="hover:text-foreground">Features</a></nav>
        <div className="flex items-center gap-2"><Link to="/login" className="hidden text-sm font-semibold text-muted-foreground hover:text-foreground sm:inline">Sign in</Link><Link to="/login" className={buttonVariants({ size: 'sm' })}>Open your workspace<ArrowRight className="ml-2 h-4 w-4" /></Link></div>
      </div>
    </header>

    <main>
      <section className="relative isolate mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 desktop:grid-cols-[1.08fr_0.92fr] desktop:py-28">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-20 -z-10 h-[460px] w-[460px] rounded-full bg-primary/10 blur-3xl" />
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />One connected workspace</div>
          <h1 className="max-w-2xl font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl desktop:text-6xl">Run the day. <span className="text-primary">Know the business.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">Bring checkout, stock, customers, payments, and reporting into a workflow your team can use from the first sale to the end-of-day close.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link to="/login" className={buttonVariants({ size: 'lg' })}>Sign in to your POS<ArrowRight className="ml-2 h-4 w-4" /></Link></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground"><span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Sales and stock stay connected</span><span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Owner, manager, and cashier workspaces</span></div>
        </div>

        <div className="relative mx-auto w-full max-w-[590px]">
          <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/15 via-transparent to-accent/15 blur-2xl" />
          <Card className="overflow-hidden rounded-3xl border-border/70 bg-card shadow-2xl shadow-primary/10">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><div><p className="text-xs font-semibold text-muted-foreground">BUSINESS OVERVIEW</p><p className="mt-1 font-semibold">Your operation, in view</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Live workspace</span></div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">{[['Sales', 'Checkout'], ['Stock', 'Inventory'], ['People', 'Customers'], ['Insights', 'Reports']].map(([value, label], index) => <div key={label} className="rounded-2xl border border-border/60 bg-background/80 p-3"><div className={`mb-5 h-2 w-2 rounded-full ${index === 0 ? 'bg-primary' : index === 1 ? 'bg-emerald-500' : index === 2 ? 'bg-amber-500' : 'bg-sky-500'}`} /><p className="text-sm font-semibold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>)}</div>
            <div className="grid gap-3 px-4 pb-4 tablet-portrait:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold">Sales activity</p><p className="mt-1 text-xs text-muted-foreground">A clear view of recent business</p></div><BarChart3 className="h-4 w-4 text-primary" /></div><div className="flex h-28 items-end gap-2">{[36, 56, 42, 76, 54, 91, 68, 100, 73, 86, 58, 78].map((height, index) => <span key={index} style={{ height: `${height}%` }} className={`flex-1 rounded-t-md ${index === 7 ? 'bg-primary' : 'bg-primary/20'}`} />)}</div><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>Sales</span><span>Inventory</span><span>Reports</span></div></div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Daily workflow</p></div><div className="mt-4 space-y-3">{['Take an order', 'Update stock', 'Review the day'].map((label, index) => <div key={label} className="flex items-center gap-2 text-xs"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${index < 2 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{index + 1}</span><span className="text-muted-foreground">{label}</span></div>)}</div></div>
            </div>
          </Card>
          <div className="absolute -bottom-5 -left-4 hidden items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-xl sm:flex"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><Boxes className="h-4 w-4" /></span><div><p className="text-xs font-bold">Stock stays in sync</p><p className="mt-0.5 text-[10px] text-muted-foreground">Sales · receiving · adjustments</p></div></div>
        </div>
      </section>

      <section id="features" className="border-y border-border/60 bg-card/65 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Connected tools</p><h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Everything for the everyday work.</h2><p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">Move from sale to stock to insight without switching systems or losing the story behind each change.</p></div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 desktop:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <Card key={title} className="group p-5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="h-5 w-5" /></span><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></Card>)}</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 tablet-portrait:grid-cols-[0.8fr_1.2fr] tablet-portrait:items-center sm:py-20"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">A practical routine</p><h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Set up once. Use it all day.</h2><p className="mt-4 text-sm leading-6 text-muted-foreground">Start with products and prices, use the POS at the counter, and review the numbers when the day is done.</p><Link to="/login" className={`${buttonVariants({ variant: 'outline' })} mt-6`}>Open your workspace<ArrowRight className="ml-2 h-4 w-4" /></Link></div><div className="grid gap-3 sm:grid-cols-3">{[['01', 'Set up your catalog', 'Products, prices, stock, and suppliers.'], ['02', 'Sell from one place', 'Orders, payments, customers, and receipts.'], ['03', 'Review and improve', 'Reports, profit, and what needs attention.']].map(([number, title, text]) => <Card key={number} className="p-5"><p className="font-display text-3xl font-bold text-primary/40">{number}</p><h3 className="mt-5 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p></Card>)}</div></section>

      <section className="px-5 pb-16 sm:px-8 sm:pb-20"><div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-3xl bg-primary p-7 text-primary-foreground sm:p-10 desktop:flex-row desktop:items-center desktop:justify-between"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/70">Meleኛ POS</p><h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Make the next sale easier.</h2><p className="mt-3 text-sm leading-6 text-primary-foreground/80">Bring your team into one connected workspace for the counter, inventory, and the decisions behind your business.</p></div><div className="flex flex-wrap gap-3"><Link to="/login" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>Sign in to POS<ArrowRight className="ml-2 h-4 w-4" /></Link></div></div></section>
    </main>

    <footer className="border-t border-border/60 bg-card/70 px-5 py-7 sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground"><span>© {new Date().getFullYear()} MELEኛ POS</span><div className="flex gap-5"><Link to="/login" className="hover:text-foreground">Sign in</Link></div></div></footer>
  </div>;
};

export default PublicHomePage;

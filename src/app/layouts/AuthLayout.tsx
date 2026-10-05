import { ReactNode, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, CalendarClock, LayoutDashboard, FileSpreadsheet, Users } from "lucide-react";

type AuthLayoutProps = {
  title: string;
  description?: string;
  headerAction?: ReactNode;
  wide?: boolean;
  legal?: boolean;
  children: ReactNode;
};

const FEATURES = [
  {
    title: "Effortless Attendance",
    description: "Streamline student check-ins with our fast, modern, and reliable tracking system.",
    icon: CalendarClock,
  },
  {
    title: "Real-time Analytics",
    description: "Monitor event participation and engagement instantly with comprehensive live dashboards and visual reports.",
    icon: LayoutDashboard,
  },
  {
    title: "Secure & Professional",
    description: "Built specifically for our university system, ensuring your data is always protected, organized, and compliant.",
    icon: ShieldCheck,
  },
  {
    title: "Automated Reporting",
    description: "Generate detailed attendance logs and export them directly to your required academic formats with a single click.",
    icon: FileSpreadsheet,
  },
  {
    title: "Seamless Integration",
    description: "Connect with existing student profiles and easily manage large crowds using quick QR code scanning.",
    icon: Users,
  }
];

export function AuthLayout({ title, description, headerAction, wide = false, legal = false, children }: AuthLayoutProps) {
  const [currentFeature, setCurrentFeature] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentFeature((prev) => (prev + 1) % FEATURES.length);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className={`plpass-auth-scene relative flex h-[100dvh] min-h-0 w-full overflow-hidden ${legal ? "plpass-auth-legal" : "plpass-auth-login"}`}>
      {/* Decorative Background for the entire view */}
      <div className="plpass-auth-grid absolute inset-0 z-0" aria-hidden="true" />
      <div className="plpass-auth-ribbons absolute inset-0 z-0" aria-hidden="true" />
      <div className="plpass-auth-ambient absolute inset-0 z-0" aria-hidden="true" />

      {/* Left Pane - visible on lg and up */}
      <section className="plpass-auth-curtain-left relative z-10 hidden w-full max-w-lg flex-1 flex-col justify-between p-8 lg:flex lg:max-w-xl xl:max-w-2xl xl:p-12 2xl:max-w-3xl">
        {/* Top Content */}
        <div className="flex flex-col items-start pt-4">
          <div className="plpass-auth-brand flex items-center gap-3">
            <div className="flex h-10 items-center justify-center">
              <img src="/plp-logo.png" alt="PLPass logo" className="h-full w-auto object-contain" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">PLPass</span>
          </div>
          <h1 className="plpass-auth-hero mt-16 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.1]">
            Simplify Attendance.<br />
            <span className="text-primary/90">Elevate Events.</span>
          </h1>
        </div>

        {/* Bottom Carousel Content */}
        <div className="plpass-auth-carousel mt-auto pb-8">
           <div className="relative h-[160px] w-full">
             {FEATURES.map((feature, i) => {
               const Icon = feature.icon;
               const isActive = i === currentFeature;
               return (
                 <div
                   key={i}
                   className={`absolute inset-0 flex flex-col items-start transition-all duration-700 ease-in-out ${isActive ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-4 opacity-0 pointer-events-none"}`}
                 >
                   <div className="flex items-center gap-3">
                     <div className="text-primary">
                       <Icon className="h-7 w-7" strokeWidth={2.5} />
                     </div>
                     <h3 className="text-xl font-bold text-foreground">{feature.title}</h3>
                   </div>
                   <p className="mt-4 max-w-sm text-base leading-relaxed text-foreground/80 md:max-w-md">
                     {feature.description}
                   </p>
                 </div>
               );
             })}
           </div>
           
           <div className="mt-8 flex gap-2">
             {FEATURES.map((_, i) => (
               <button
                 key={i}
                 className={`h-1.5 rounded-full transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-primary ${i === currentFeature ? "w-8 bg-primary" : "w-3 bg-primary/20 hover:bg-primary/40"}`}
                 onClick={() => setCurrentFeature(i)}
                 aria-label={`Go to slide ${i + 1}`}
               />
             ))}
           </div>
        </div>
      </section>

      {/* Right Pane */}
      <section className="plpass-auth-curtain-right relative z-10 flex min-h-0 w-full flex-col justify-center overflow-hidden px-4 py-8 sm:px-6 lg:flex-1 lg:px-12 xl:px-24">
        
        {/* Mobile Header (hidden on lg and up) */}
        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
          <div className="flex h-12 items-center justify-center">
            <img src="/plp-logo.png" alt="PLPass logo" className="h-full w-auto object-contain" />
          </div>
          <p className="mt-4 text-2xl font-bold text-foreground">PLPass</p>
          <p className="mt-1 text-sm text-muted-foreground">Event attendance workspace</p>
        </div>

        <div className={`mx-auto w-full ${wide ? "max-w-3xl" : "max-w-[440px]"} ${legal ? "flex h-full min-h-0 flex-1 flex-col" : ""}`}>
          
          <div className={`plpass-auth-card relative rounded-[2rem] border border-border/40 p-6 sm:p-8 md:p-10 ${legal ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-surface/95" : "bg-surface/95 backdrop-blur-xl shadow-2xl shadow-primary/10"}`}>
            {headerAction ? <div className={`mb-4 ${legal ? "self-start" : ""}`}>{headerAction}</div> : null}
            <div className="mb-8 text-center lg:text-left">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
              {description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
            </div>

            <div className={`plpass-auth-content ${legal ? "min-h-0 flex flex-1 flex-col pr-2" : ""}`}>
              {children}
            </div>
          </div>

          <footer className="mt-3 flex shrink-0 justify-center gap-6 text-xs font-medium text-foreground/70">
            <Link to="/terms" className="hover:text-primary hover:underline transition-colors">Terms of Use</Link>
            <Link to="/privacy" className="hover:text-primary hover:underline transition-colors">Privacy Policy</Link>
          </footer>
        </div>
      </section>
    </main>
  );
}

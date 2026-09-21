import { useMemo, useState } from "react";
import { ChevronDown, CircleHelp, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils/cn";

type FaqItem = {
  question: string;
  answer: string;
};

type FaqCategory = {
  title: string;
  items: FaqItem[];
};

const faqCategories: FaqCategory[] = [
  {
    title: "Getting started",
    items: [
      {
        question: "How do I sign in to PLPass?",
        answer: "Use the school account credentials provided to you, then sign in from the PLPass login page. If you cannot sign in, use Forgot password or contact your school support channel. Never share your password or verification codes with another person."
      },
      {
        question: "What can I see from the student dashboard?",
        answer: "Your dashboard brings together upcoming events, attendance progress, recent attendance records, pending tasks, and links to the student tools available to your account."
      },
      {
        question: "How do I update my student profile?",
        answer: "Open Profile from the student navigation. You can review your account and student details there. If a school-managed value is incorrect or cannot be changed, ask an organizer or administrator to update it."
      },
      {
        question: "What should I do if I forgot my password?",
        answer: "Select Forgot password on the login page and follow the recovery instructions sent to your registered email. If the message does not arrive, check spam and confirm that you are using the email associated with your account."
      }
    ]
  },
  {
    title: "Events and attendance",
    items: [
      {
        question: "Where can I find an event I need to attend?",
        answer: "Open Events to review events visible to you, or use the event and schedule links from the dashboard. Select an event to view its schedule, venue, attendance information, and other details made available by the organizer."
      },
      {
        question: "Why can’t I see an event or class?",
        answer: "Students only see events assigned or made visible to their account. Check that you are signed in to the correct account and refresh the page. If the event is still missing, contact its organizer or your school support channel."
      },
      {
        question: "What attendance methods are available?",
        answer: "Your Attendance Methods page shows the verification methods enabled for your account, such as a student QR credential and facial recognition. The organizer’s session settings determine which method can be used at a particular event."
      },
      {
        question: "How do I use my QR credential?",
        answer: "Open Attendance Methods and display your active QR credential for the organizer’s scanner. Keep the screen bright and steady, and use the credential belonging to your own account. A screenshot or another student’s QR must not be used."
      },
      {
        question: "Why is my QR credential pending or unavailable?",
        answer: "Your credential may still be provisioning, inactive, expired, or unavailable because your account is not ready for attendance verification. Refresh Attendance Methods and, if it remains unavailable, ask an organizer to verify your account or attendance manually."
      },
      {
        question: "How do I enroll or use facial recognition?",
        answer: "Open Attendance Methods and follow the enrollment flow when facial recognition is enabled for your account. Use good lighting, keep your face visible, and follow the on-screen instructions. You can use the supported photo fallback if camera access is unavailable."
      },
      {
        question: "What if attendance verification fails?",
        answer: "Try the available method again in the session’s attendance window. For QR, increase screen brightness and hold the code steady. For facial recognition, improve lighting and remove anything covering your face. If the problem continues, use Report attendance issue and include a clear explanation."
      },
      {
        question: "Can I check in after the attendance window closes?",
        answer: "Attendance windows and late rules are controlled by the event organizer. PLPass cannot guarantee a late check-in. Contact the organizer promptly if you missed the window or were present but could not complete verification."
      }
    ]
  },
  {
    title: "Records and requests",
    items: [
      {
        question: "Where can I view my attendance records?",
        answer: "Open Attendance Records to review event attendance, verification details, times, and any available remarks. Records become visible after the attendance system receives and processes the event activity."
      },
      {
        question: "What do the attendance statuses mean?",
        answer: "Attendance has three final statuses: Present, Late, or Absent. Present and Late are assigned only after Time In, Time Out, and the required event feedback. If your Time In is after the late cutoff, submit your late reason after Time Out and before event feedback."
      },
      {
        question: "How do I request an attendance correction?",
        answer: "Open Correction Requests, select the related attendance record, choose the requested status, explain what happened, and attach the requested proof when prompted. Submit only information that is accurate and related to your own record."
      },
      {
        question: "How do I track a correction request?",
        answer: "Open Request History to see submitted correction requests and attendance issue reports, including their status, reference, and available review remarks. A pending request has not been finalized by the reviewer yet."
      },
      {
        question: "Why is my correction request still pending?",
        answer: "Requests remain pending until the assigned organizer or reviewer evaluates them. Avoid submitting duplicates; instead, monitor Request History and contact the organizer if you need to provide an important clarification."
      },
      {
        question: "How do I report a QR or facial-recognition issue?",
        answer: "Open Attendance Methods, choose Report attendance issue, describe the problem clearly, and attach supporting proof if requested. Your report will appear in Request History after it is submitted."
      },
      {
        question: "What if a class or event name is missing from a request?",
        answer: "Your submitted request can still be retained even when linked details are temporarily unavailable. Use the record or event reference shown in Request History and contact the organizer if you need the linked name confirmed."
      }
    ]
  },
  {
    title: "Privacy, security, and troubleshooting",
    items: [
      {
        question: "Who can see my student information and attendance?",
        answer: "PLPass displays student information according to your signed-in role and the access rules for the school workspace. Do not share your account, QR credential, or uploaded proof with anyone who does not need it."
      },
      {
        question: "How is my facial information handled?",
        answer: "Facial enrollment is optional only where enabled by the school and is used for attendance verification. Use the in-app controls to review its status. If you have a privacy concern, contact your school administrator before enrolling or ask about another available attendance method."
      },
      {
        question: "What should I do if PLPass is not loading correctly?",
        answer: "Refresh the page, confirm your internet connection, and try a current browser with camera permissions enabled when using facial recognition. If the problem continues, note the page, time, and error message before contacting support."
      },
      {
        question: "Why are notifications or request updates delayed?",
        answer: "Notifications depend on the event or request being processed and on your browser or email delivery. Check Notifications and Request History directly. If an update remains missing, contact the organizer or school support channel with the relevant reference."
      },
      {
        question: "How do I get help with a problem that is not listed here?",
        answer: "Record the page you were using, the event or request reference, what you expected to happen, and the exact message shown. Then contact your event organizer or the school’s PLPass support channel. Do not send your password or authentication codes."
      }
    ]
  }
];

export function StudentFaqPage() {
  const [search, setSearch] = useState("");
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleCategories = useMemo(
    () => faqCategories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => !normalizedSearch || `${item.question} ${item.answer}`.toLowerCase().includes(normalizedSearch))
      }))
      .filter((category) => category.items.length > 0),
    [normalizedSearch]
  );
  const resultCount = visibleCategories.reduce((total, category) => total + category.items.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student help"
        title="Frequently Asked Questions"
        description="Find quick answers about your account, events, attendance, records, and requests."
      />

      <section className="relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm md:p-6">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />
        <label className="flex h-12 items-center gap-3 rounded-xl border bg-background px-4 text-sm">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search frequently asked questions</span>
          <input
            aria-label="Search frequently asked questions"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-transparent outline-none"
            placeholder="Search FAQs..."
          />
        </label>
        <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
          {resultCount} {resultCount === 1 ? "answer" : "answers"} available
        </p>
      </section>

      {visibleCategories.length ? (
        <div className="space-y-5">
          {visibleCategories.map((category) => (
            <section key={category.title} className="relative overflow-hidden rounded-2xl border bg-surface shadow-sm">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />
              <div className="flex items-center gap-3 border-b px-5 py-4 md:px-6">
                <CircleHelp className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="text-lg font-semibold tracking-tight">{category.title}</h2>
              </div>
              <div className="divide-y">
                {category.items.map((item) => {
                  const isOpen = openQuestion === item.question;
                  const answerId = `faq-answer-${item.question.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                  return (
                    <div key={item.question}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={answerId}
                        onClick={() => setOpenQuestion(isOpen ? null : item.question)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold transition hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:px-6"
                      >
                        <span>{item.question}</span>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
                      </button>
                      {isOpen ? (
                        <p id={answerId} className="px-5 pb-5 text-sm leading-6 text-muted-foreground md:px-6">
                          {item.answer}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed bg-surface p-8 text-center">
          <CircleHelp className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">No matching FAQs</h2>
          <p className="mt-1 text-sm text-muted-foreground">Try a different search term or clear the search box.</p>
        </section>
      )}
    </div>
  );
}

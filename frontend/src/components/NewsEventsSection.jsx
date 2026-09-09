import { NEWS_ITEMS, UPCOMING_EVENTS } from "../lib/newsEvents";

function Badge({ children }) {
  return (
    <span className="absolute top-3 left-3 bg-forest-900 text-cream-50 text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-md">
      {children}
    </span>
  );
}

function FeaturedNewsCard({ item }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md h-full flex flex-col">
      <div className="relative">
        <img src={item.image} alt={item.title} className="w-full h-56 object-cover" />
        <Badge>{item.type}</Badge>
      </div>
      <div className="bg-[#ebebc2] p-5 flex-1 flex flex-col">
        <h4 className="font-display font-bold text-ink-900 mb-2">{item.title}</h4>
        <p className="text-sm text-forest-800 leading-relaxed flex-1">{item.excerpt}</p>
        <button type="button" className="self-end text-sm font-semibold text-forest-900 hover:underline mt-3">
          Read More
        </button>
      </div>
    </div>
  );
}

function CompactNewsCard({ item }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md flex">
      <div className="relative w-2/5 shrink-0">
        <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
        <Badge>{item.type}</Badge>
      </div>
      <div className="bg-[#ebebc2] p-4 flex-1 flex flex-col justify-center">
        <h4 className="font-display font-bold text-ink-900 text-sm mb-1 leading-snug">{item.title}</h4>
        <button type="button" className="self-start text-xs font-semibold text-forest-900 hover:underline mt-1">
          Read More
        </button>
      </div>
    </div>
  );
}

function UpcomingEventsCard() {
  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-[#ebebc2] rounded-2xl shadow-md p-5 flex-1">
        <h4 className="font-display font-bold text-ink-900 text-center mb-4">UPCOMING EVENTS</h4>
        <div className="space-y-4">
          {UPCOMING_EVENTS.map((ev, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-forest-800 text-cream-50 flex flex-col items-center justify-center leading-none shrink-0">
                <span className="text-[9px] font-semibold">{ev.month}</span>
                <span className="text-sm font-bold">{ev.day}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">{ev.title}</p>
                <p className="text-xs text-forest-700">{ev.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <a  
        href="#"
        target="_blank"
        rel="noreferrer"
        className="bg-forest-900 rounded-2xl shadow-md p-4 flex items-center gap-3 hover:bg-forest-800 transition-colors"
      >
        <span className="w-9 h-9 rounded-full bg-cream-50 text-forest-900 flex items-center justify-center shrink-0 font-bold text-lg">
          f
        </span>
        <div>
          <p className="text-cream-50 font-semibold text-sm italic">Keep up with the Latest News!</p>
          <p className="text-cream-100/80 text-xs">Follow us on Facebook</p>
        </div>
      </a>
    </div>
  );
}

export default function NewsEventsSection() {
  const [featured, ...rest] = NEWS_ITEMS;

  return (
    <section className="max-w-6xl mx-auto px-6 pb-20">
      <div className="bg-[#c7f5a8] rounded-3xl shadow-lg p-8 md:p-10">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-ink-900 mb-8">NEWS and EVENTS</h2>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {featured && <FeaturedNewsCard item={featured} />}

          <div className="flex flex-col gap-6">
            {rest.map((item, i) => (
              <CompactNewsCard key={i} item={item} />
            ))}
          </div>

          <UpcomingEventsCard />
        </div>
      </div>
    </section>
  );
}

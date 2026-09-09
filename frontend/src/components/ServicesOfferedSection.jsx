import { useEffect, useRef } from "react";
import { SERVICES_OFFERED } from "../lib/servicesOffered";

const CARD_WIDTH = 420; // px, includes the card itself
const GAP = 24; // px, spacing between cards
const STEP = CARD_WIDTH + GAP;
const SET_WIDTH = STEP * SERVICES_OFFERED.length;

// Render the list 3x back-to-back so there's always a buffer of cards
// on both sides, letting us silently "teleport" the scroll position
// once the person scrolls near either edge — creating a seamless loop.
const TRIPLED = [...SERVICES_OFFERED, ...SERVICES_OFFERED, ...SERVICES_OFFERED];

function ServiceCard({ service, dark }) {
  return (
    <div
      className={`shrink-0 rounded-2xl shadow-lg overflow-hidden flex select-none ${
        dark ? "bg-forest-800" : "bg-[#cffdb0]"
      }`}
      style={{ width: CARD_WIDTH }}
    >
      <img
        src={service.image}
        alt={service.title}
        className="w-2/5 h-full object-cover pointer-events-none"
        draggable={false}
      />
      <div className="p-5 flex flex-col justify-center">
        <h3 className={`font-display font-bold text-lg mb-2 ${dark ? "text-cream-50" : "text-ink-900"}`}>
          {service.title}
        </h3>
        <p className={`text-sm leading-relaxed ${dark ? "text-cream-100/90" : "text-forest-800"}`}>
          {service.description}
        </p>
      </div>
    </div>
  );
}

export default function ServicesOfferedSection() {
  const trackRef = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);

  // Start centered on the middle copy of the list.
  useEffect(() => {
    if (trackRef.current) {
      trackRef.current.scrollLeft = SET_WIDTH;
    }
  }, []);

  // Whenever the scroll position drifts into the first or third copy,
  // silently jump back by one set width — same visual spot, no animation.
  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    if (track.scrollLeft <= 0) {
      track.scrollLeft += SET_WIDTH;
    } else if (track.scrollLeft >= SET_WIDTH * 2) {
      track.scrollLeft -= SET_WIDTH;
    }
  };

  // Let a normal vertical mouse wheel scroll the carousel horizontally.
  const handleWheel = (e) => {
    const track = trackRef.current;
    if (!track) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      track.scrollLeft += e.deltaY;
    }
  };

  // Click-and-drag scrolling for desktop (mouse) users.
  const onMouseDown = (e) => {
    isDragging.current = true;
    dragStartX.current = e.pageX;
    dragStartScroll.current = trackRef.current.scrollLeft;
  };
  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    trackRef.current.scrollLeft = dragStartScroll.current - (e.pageX - dragStartX.current);
  };
  const stopDragging = () => {
    isDragging.current = false;
  };

  return (
    <section className="pb-4">
      <div className="max-w-6xl mx-auto px-6 pt-12 pb-6">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-ink-900">Services Offered</h2>
      </div>

      <div className="bg-[#eaeac1] py-10">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
          className="max-w-6xl mx-auto px-6 flex gap-6 overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing"
        >
          {TRIPLED.map((service, i) => (
            <ServiceCard key={i} service={service} dark={i % SERVICES_OFFERED.length % 2 === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
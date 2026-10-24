import { useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { IndianRupee, Layers, MapPin, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EventSelect } from "@/components/EventSelect";
import { listEvents } from "@/lib/api/sponsorship";
import { eventTypeOptions } from "@/lib/event-types";
import type { EventRecord } from "@/types/sponsorship";
import type { CreateResearchJobInput } from "@/types/domain";

interface EventDetailsFormProps {
  onSubmit: (input: CreateResearchJobInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

type FormTab = "overview" | "audience" | "sponsorship";
const tabOrder: FormTab[] = ["overview", "audience", "sponsorship"];

const formatOptions = [
  { value: "in_person", label: "In-person at venue" },
  { value: "hybrid", label: "Hybrid (physical + virtual stream)" },
  { value: "online", label: "Fully online / remote" },
];

const supportTypeOptions = [
  { value: "cash", label: "Cash grant" },
  { value: "cloud_credits", label: "Cloud credits / API grants" },
  { value: "prizes", label: "Prizes & hardware" },
  { value: "food", label: "Food & beverage" },
  { value: "merchandise", label: "T-shirts & swag" },
  { value: "other", label: "Venue / marketing" },
];

/** Input with a leading icon or symbol. */
function IconInput({ icon, ...props }: ComponentProps<typeof Input> & { icon: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <Input className="pl-8" {...props} />
    </div>
  );
}

export function EventDetailsForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: EventDetailsFormProps) {
  const [formData, setFormData] = useState<CreateResearchJobInput>({
    event_name: "",
    event_type: "hackathon",
    event_theme: "",
    event_description: "",
    venue_city: "",
    venue_state: "",
    venue_name: "",
    event_format: "in_person",
    start_date: "",
    end_date: "",
    expected_footfall: undefined,
    primary_audience: "",
    audience_age_range: "18-24",
    academic_disciplines: "",
    institution_name: "",
    budget_target_inr: undefined,
    support_types_needed: ["cash", "cloud_credits"],
    sponsorship_tiers: "",
    sponsor_benefits: "",
    previous_sponsors_hint: "",
    additional_notes: "",
  });

  const [activeTab, setActiveTab] = useState<FormTab>("overview");
  const tabIndex = tabOrder.indexOf(activeTab);

  const update = (patch: Partial<CreateResearchJobInput>) => setFormData((current) => ({ ...current, ...patch }));

  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const savedEvents = eventsQuery.data ?? [];

  /** Link the run to a saved event so its leads can go into that event's pipeline; fills matching fields. */
  const linkEvent = (eventId: string | null) => {
    const event: EventRecord | undefined = savedEvents.find((e) => e.id === eventId);
    if (!event) {
      update({ event_id: undefined });
      return;
    }
    update({
      event_id: event.id,
      event_name: event.name,
      event_type: eventTypeOptions.some((o) => o.value === event.event_type) ? event.event_type : formData.event_type,
      institution_name: event.institution,
      venue_city: event.location || formData.venue_city,
      event_format: event.is_online ? "online" : formData.event_format,
      start_date: event.start_date,
      end_date: event.end_date || "",
      expected_footfall: event.expected_attendees ?? formData.expected_footfall,
      primary_audience: event.target_audience || formData.primary_audience,
      event_description: event.description || formData.event_description,
    });
  };

  const loadExamplePreset = (type: "hackathon" | "fest" | "summit") => {
    if (type === "hackathon") {
      setFormData((current) => ({
        event_id: current.event_id, // keep the saved-event link when loading an example
        event_name: "CodeStorm Hackathon 2026",
        event_type: "hackathon",
        event_theme: "Generative AI, Web3 & Sustainable Tech",
        event_description: "A 36-hour national college hackathon bringing together top student developers and creators.",
        venue_city: "Bengaluru",
        venue_state: "Karnataka",
        venue_name: "BMS College of Engineering Campus",
        event_format: "in_person",
        start_date: "2026-11-15",
        end_date: "2026-11-17",
        expected_footfall: 800,
        primary_audience: "Undergraduate Computer Science students, budding founders, developers",
        audience_age_range: "18-24",
        academic_disciplines: "Computer Science, AI/ML, Data Engineering, Design",
        institution_name: "BMS College of Engineering",
        budget_target_inr: 500000,
        support_types_needed: ["cash", "cloud_credits", "prizes", "food"],
        sponsorship_tiers: "Title (₹2.5L), Platinum (₹1L), Gold (₹50k), Cloud/API Partner",
        sponsor_benefits: "Keynote presentation, Dedicated recruitment resume database, Custom prize track, Booth at venue, Logo on all posters and badges",
        previous_sponsors_hint: "Google Cloud, GitHub, Postman, Red Bull",
        additional_notes: "Targeting dev-tool startups and tech companies looking for college tech talent.",
      }));
    } else if (type === "fest") {
      setFormData((current) => ({
        event_id: current.event_id, // keep the saved-event link when loading an example
        event_name: "Rendezvous Cultural Fest 2026",
        event_type: "cultural_fest",
        event_theme: "Echoes of Modern India",
        event_description: "Annual cultural festival hosting dance, music competitions, and celebrity night.",
        venue_city: "New Delhi",
        venue_state: "Delhi",
        venue_name: "IIT Delhi OAT",
        event_format: "in_person",
        start_date: "2026-10-25",
        end_date: "2026-10-28",
        expected_footfall: 15000,
        primary_audience: "College youth, creative artists, young adults across NCR colleges",
        audience_age_range: "17-25",
        academic_disciplines: "Engineering, Arts, Commerce, Media",
        institution_name: "IIT Delhi",
        budget_target_inr: 2500000,
        support_types_needed: ["cash", "food", "merchandise", "prizes"],
        sponsorship_tiers: "Title (₹10L), Powered By (₹5L), Associate (₹2L)",
        sponsor_benefits: "Main stage naming rights, Experience zones, Sampling stalls, Large hoardings, Social media shoutouts to 50k followers",
        previous_sponsors_hint: "Coca Cola, Fastrack, Spotify, Dominos",
        additional_notes: "Looking for beverage, FMCG, apparel, and lifestyle brands.",
      }));
    } else {
      setFormData((current) => ({
        event_id: current.event_id, // keep the saved-event link when loading an example
        event_name: "FinTech Innovation Summit",
        event_type: "tech_conference",
        event_theme: "Next-Gen Payments and Open Banking",
        event_description: "Premier student and professional conference discussing UPI innovations and algorithmic trading.",
        venue_city: "Mumbai",
        venue_state: "Maharashtra",
        venue_name: "Convention Hall, Bandra Kurla Complex",
        event_format: "hybrid",
        start_date: "2026-12-05",
        end_date: "2026-12-06",
        expected_footfall: 1200,
        primary_audience: "Finance professionals, MBA candidates, FinTech developers",
        audience_age_range: "21-35",
        academic_disciplines: "Finance, Economics, CS, Business Administration",
        institution_name: "FinTech Club & Industry Partners",
        budget_target_inr: 1200000,
        support_types_needed: ["cash", "cloud_credits"],
        sponsorship_tiers: "Principal Sponsor (₹5L), Co-sponsor (₹2L)",
        sponsor_benefits: "Panel speaking slots, VIP networking dinner access, Digital banners on live stream",
        previous_sponsors_hint: "Razorpay, Zerodha, HDFC Bank",
        additional_notes: "Fintech, banking, and wealth management companies.",
      }));
    }
  };

  const canSubmit = Boolean(formData.event_name.trim() && formData.venue_city.trim());

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      // Required fields live on the first tab.
      setActiveTab("overview");
      return;
    }
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-5xl">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-5 text-primary" />
            Launch live sponsor discovery
          </CardTitle>
          <CardDescription>
            Provide details about your event. The research engine will build targeted queries and verify real brand leads.
          </CardDescription>
          <div className="col-span-full flex flex-wrap items-center gap-1.5 pt-2">
            <span className="text-xs text-muted-foreground">Quick preset:</span>
            <Button type="button" variant="outline" size="xs" onClick={() => loadExamplePreset("hackathon")}>Hackathon</Button>
            <Button type="button" variant="outline" size="xs" onClick={() => loadExamplePreset("fest")}>College fest</Button>
            <Button type="button" variant="outline" size="xs" onClick={() => loadExamplePreset("summit")}>Summit</Button>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FormTab)}>
            <TabsList className="mb-4 h-auto flex-wrap">
              <TabsTrigger value="overview"><Layers />1. Event &amp; logistics</TabsTrigger>
              <TabsTrigger value="audience"><Users />2. Target audience</TabsTrigger>
              <TabsTrigger value="sponsorship"><IndianRupee />3. Sponsorship goals</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="edf-linked-event">Saved event</FieldLabel>
                  {savedEvents.length ? (
                    <EventSelect id="edf-linked-event" events={savedEvents} value={formData.event_id ?? null} onChange={linkEvent} allowAll allLabel="Don't link to an event" className="w-full" />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No saved events yet. <Link className="text-primary hover:underline" to="/events">Create one</Link> to link this run to it.
                    </p>
                  )}
                  <FieldDescription>
                    Optional. Linking pre-fills the details below and pre-selects this event when you add leads to a pipeline.
                  </FieldDescription>
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="edf-event-name">Event name *</FieldLabel>
                  <Input id="edf-event-name" required placeholder="e.g. HackSprint 2026, Annual TechCon, Oasis Fest" value={formData.event_name} onChange={(e) => update({ event_name: e.target.value })} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-event-type">Event type *</FieldLabel>
                  <Select value={formData.event_type} onValueChange={(value) => update({ event_type: value })}>
                    <SelectTrigger id="edf-event-type" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eventTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-institution-name">Host institution / organization</FieldLabel>
                  <Input id="edf-institution-name" placeholder="e.g. IIT Delhi, BITS Pilani, Rotary Club" value={formData.institution_name || ""} onChange={(e) => update({ institution_name: e.target.value })} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-event-theme">Event theme or tagline</FieldLabel>
                  <Input id="edf-event-theme" placeholder="e.g. AI for Sustainability" value={formData.event_theme || ""} onChange={(e) => update({ event_theme: e.target.value })} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-event-format">Format</FieldLabel>
                  <Select value={formData.event_format || "in_person"} onValueChange={(value) => update({ event_format: value as CreateResearchJobInput["event_format"] })}>
                    <SelectTrigger id="edf-event-format" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {formatOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-venue-city">City *</FieldLabel>
                  <IconInput id="edf-venue-city" icon={<MapPin />} required placeholder="e.g. Bengaluru, New Delhi, Mumbai" value={formData.venue_city} onChange={(e) => update({ venue_city: e.target.value })} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-venue-state">State / region</FieldLabel>
                  <Input id="edf-venue-state" placeholder="e.g. Karnataka, Maharashtra, Delhi NCR" value={formData.venue_state || ""} onChange={(e) => update({ venue_state: e.target.value })} />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="edf-venue-name">Venue name</FieldLabel>
                  <Input id="edf-venue-name" maxLength={200} placeholder="e.g. BMS College of Engineering Campus, IIT Delhi OAT" value={formData.venue_name || ""} onChange={(e) => update({ venue_name: e.target.value })} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-start-date">Start date</FieldLabel>
                  <Input
                    id="edf-start-date"
                    type="date"
                    value={formData.start_date || ""}
                    onChange={(e) => {
                      const start_date = e.target.value;
                      // Clear an end date that would now be before the start date.
                      const end_date = formData.end_date && start_date && formData.end_date < start_date ? "" : formData.end_date;
                      update({ start_date, end_date });
                    }}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-end-date">End date</FieldLabel>
                  <Input id="edf-end-date" type="date" min={formData.start_date || undefined} value={formData.end_date || ""} onChange={(e) => update({ end_date: e.target.value })} />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="edf-event-description">Event description</FieldLabel>
                  <Textarea id="edf-event-description" rows={3} placeholder="Short summary of what happens at the event, its scale and reputation." value={formData.event_description || ""} onChange={(e) => update({ event_description: e.target.value })} />
                </Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="audience">
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="edf-expected-footfall">Expected attendees</FieldLabel>
                  <IconInput
                    id="edf-expected-footfall"
                    icon={<Users />}
                    type="number"
                    min="10"
                    max="1000000"
                    placeholder="e.g. 500, 2000, 15000"
                    value={formData.expected_footfall || ""}
                    onChange={(e) => update({ expected_footfall: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                  />
                  <FieldDescription>Helps determine appropriate sponsor size and reach.</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-audience-age-range">Target age group</FieldLabel>
                  <Input id="edf-audience-age-range" placeholder="e.g. 18-24, 21-35" value={formData.audience_age_range || ""} onChange={(e) => update({ audience_age_range: e.target.value })} />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="edf-primary-audience">Primary audience</FieldLabel>
                  <Input id="edf-primary-audience" placeholder="e.g. Undergrad CS students, software engineers, young founders" value={formData.primary_audience || ""} onChange={(e) => update({ primary_audience: e.target.value })} />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="edf-academic-disciplines">Academic disciplines &amp; interests</FieldLabel>
                  <Input id="edf-academic-disciplines" placeholder="e.g. Computer Science, AI/ML, Robotics, Design, Commerce" value={formData.academic_disciplines || ""} onChange={(e) => update({ academic_disciplines: e.target.value })} />
                  <FieldDescription>Used to match niche technology and industry sponsors.</FieldDescription>
                </Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="sponsorship">
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="edf-budget-target-inr">Sponsorship budget target (₹)</FieldLabel>
                  <IconInput
                    id="edf-budget-target-inr"
                    icon={<span className="text-sm">₹</span>}
                    type="number"
                    min="0"
                    step="5000"
                    placeholder="e.g. 500000 (5 lakhs)"
                    value={formData.budget_target_inr || ""}
                    onChange={(e) => update({ budget_target_inr: e.target.value ? parseFloat(e.target.value) : undefined })}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edf-previous-sponsors-hint">Previous sponsors</FieldLabel>
                  <Input id="edf-previous-sponsors-hint" placeholder="e.g. Google Cloud, Red Bull, Postman" value={formData.previous_sponsors_hint || ""} onChange={(e) => update({ previous_sponsors_hint: e.target.value })} />
                  <FieldDescription>Helps find competitors or similar brands that sponsor events.</FieldDescription>
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="edf-sponsorship-tiers">Sponsorship tiers</FieldLabel>
                  <Input id="edf-sponsorship-tiers" maxLength={1000} placeholder="e.g. Title (₹2.5L), Platinum (₹1L), Gold (₹50k)" value={formData.sponsorship_tiers || ""} onChange={(e) => update({ sponsorship_tiers: e.target.value })} />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel id="edf-support-types-label">Support types needed</FieldLabel>
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    spacing={2}
                    aria-labelledby="edf-support-types-label"
                    className="flex-wrap justify-start"
                    value={formData.support_types_needed || []}
                    onValueChange={(value) => update({ support_types_needed: value })}
                  >
                    {supportTypeOptions.map((opt) => (
                      <ToggleGroupItem
                        key={opt.value}
                        value={opt.value}
                        className="data-[state=on]:border-primary data-[state=on]:bg-brand-soft data-[state=on]:text-primary"
                      >
                        {opt.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldDescription>Select all that apply.</FieldDescription>
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="edf-sponsor-benefits">Benefits offered to sponsors</FieldLabel>
                  <Textarea id="edf-sponsor-benefits" rows={3} placeholder="e.g. Keynote speech, booth space, resume database, logo on badges" value={formData.sponsor_benefits || ""} onChange={(e) => update({ sponsor_benefits: e.target.value })} />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="edf-additional-notes">Additional notes</FieldLabel>
                  <Textarea id="edf-additional-notes" rows={3} maxLength={2000} placeholder="e.g. Targeting dev-tool startups looking for college tech talent." value={formData.additional_notes || ""} onChange={(e) => update({ additional_notes: e.target.value })} />
                  <FieldDescription>Anything else the research should know, such as brands to target or avoid.</FieldDescription>
                </Field>
              </FieldGroup>
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="flex-wrap justify-between gap-3">
          <div className="flex items-center gap-2">
            {tabIndex > 0 ? (
              <Button type="button" variant="outline" onClick={() => setActiveTab(tabOrder[tabIndex - 1])}>Back</Button>
            ) : null}
            {tabIndex < tabOrder.length - 1 ? (
              <Button type="button" variant="outline" onClick={() => setActiveTab(tabOrder[tabIndex + 1])}>Next step →</Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
            ) : null}
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? <Spinner /> : <Sparkles />}
              {isSubmitting ? "Starting research…" : "Start sponsor discovery"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}

/** Every prompt, schema and tool definition the Worker sends to Meta models.
 * Kept in one dependency-free module so eval/benchmark.ts measures exactly what ships. */
import type { ReportState, Sighting } from './types'
import type { ContentPart } from './meta'

export const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    is_match: { type: 'boolean' },
    confidence: { type: 'number' },
    rationale: { type: 'string' },
  },
  required: ['is_match', 'confidence', 'rationale'],
  additionalProperties: false,
}

export function matchPrompt(pet: ReportState['pet'], transcript: string | null, trackRef: string): ContentPart[] {
  let desc = pet.description
  if (transcript) desc += `\nOwner's voice note: "${transcript}"`
  return [
    {
      type: 'input_text',
      text:
        `Lost pet report. Name: ${pet.name}. Species: ${pet.species}.\nDescription: ${desc}\n\n` +
        `Image 1 is the owner's reference photo of ${pet.name}. Image 2 is one detection (${trackRef}) cropped from neighborhood camera footage.\n` +
        `Decide whether the animal in image 2 could be ${pet.name}. Judge by robust appearance attributes ` +
        `(coat color/pattern, size, build, markings, ear/tail shape). If image 2 shows no animal or an unusable crop, is_match=false with low confidence.`,
    },
  ] as ContentPart[]
}

export const TOOLS = [
  {
    type: 'function',
    name: 'suggest_next_search',
    description: 'Record the recommended next search plan for the owner, based on the sighting pattern.',
    parameters: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        window: { type: 'string' },
        area: { type: 'string' },
        why: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' } },
      },
      required: ['headline', 'window', 'area', 'why', 'steps'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'make_poster',
    description: 'Generate a shareable lost-pet alert poster image.',
    parameters: {
      type: 'object',
      properties: { poster_prompt: { type: 'string' }, headline_text: { type: 'string' } },
      required: ['poster_prompt', 'headline_text'],
      additionalProperties: false,
    },
  },
]

export function coordinatorInput(pet: ReportState['pet'], transcript: string | null, sightings: Sighting[], bestStillB64: string) {
  return [{
    type: 'message',
    role: 'user',
    content: [
      {
        type: 'input_text',
        text:
          `You are the search coordinator for a lost ${pet.species} named ${pet.name}.\n` +
          `Owner description: ${pet.description}\nOwner voice note: ${transcript ?? 'n/a'}\n` +
          `Confirmed camera sightings:\n${JSON.stringify(sightings, null, 1)}\n\n` +
          'Decide what to do next using your tools: record a concrete next-search plan (suggest_next_search) ' +
          'and generate the shareable alert poster (make_poster). Then finish with a one-paragraph summary for the owner.',
      },
      { type: 'input_image', image_url: bestStillB64 },
    ],
  }]
}

export function posterPrompt(args: { poster_prompt: string; headline_text: string }): string {
  // A real owner prints this: invented phone numbers or rewards would send finders to a stranger.
  return (
    `${args.poster_prompt}. Bold headline text at top: '${args.headline_text}'. Clean lost-pet alert poster layout, high contrast, printable. ` +
    `Do not invent any phone number, email, address, name of a person, or reward. ` +
    `Leave one clearly blank line reading 'Contact: ____________' for the owner to fill in by hand.`
  )
}

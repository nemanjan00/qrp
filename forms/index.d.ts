/** An input factory: builds a two-way-bound control for settings[key]. */
export type InputFactory = (
	settings: Record<string, any>,
	key: string,
	field?: FieldSpec
) => Element;

/** A field descriptor in a form()/field() config. */
export interface FieldSpec {
	name?: string;
	description?: string;
	/** A registered input type name (e.g. "text", "select", "email"). */
	type?: string;
	/** A procedural input factory (wins over `type`). */
	input?: InputFactory;
	default?: unknown;
	/** For select/radio types. */
	options?: Record<string, string>;
	/** Passthrough native attributes. */
	placeholder?: string;
	min?: number | string;
	max?: number | string;
	step?: number | string;
	pattern?: string;
	required?: boolean;
	autocomplete?: string;
	[key: string]: any;
}

export interface Section {
	name: string;
	filter: (key: string, value?: unknown) => boolean;
}

export interface FormSpec {
	settings: Record<string, any>;
	fields?: Record<string, FieldSpec>;
	sections?: Section[];
}

/** Parse a KEY=value config string into an object. */
export function parseKV(text: string): Record<string, string>;

/** Serialize an object back to a KEY=value string. */
export function serializeKV(settings: Record<string, any>): string;

/** Register (or override) an input type by name; returns the factory. */
export function registerInput(type: string, factory: InputFactory): InputFactory;

/** Look up a registered input factory by name. */
export function getInput(type: string): InputFactory | undefined;

/** A select factory built from inline options (procedural style). */
export function multichoice(options: Record<string, string>): InputFactory;

/** The input registry, addressable by type name, plus `multichoice`. */
export const inputs: Record<string, InputFactory> & { multichoice: typeof multichoice };

/** Render one labelled field (label + input + description). */
export function field(settings: Record<string, any>, key: string, spec?: FieldSpec): HTMLElement;

/** Render a full settings form grouped into sections. */
export function form(spec: FormSpec): HTMLElement;

/** A textarea editing the same settings state (KEY=value), both directions. */
export function textual(settings: Record<string, any>): HTMLTextAreaElement;

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

interface XmlElement {
  attributes: Record<string, unknown>;
  content: XmlNode[];
}

type XmlNode = Record<string, unknown>;

export interface PubmedAbstractSection {
  label: string | null;
  text: string;
}

export interface PubmedAuthor {
  name: string;
  orcid: string | null;
  affiliations: string[];
}

export interface PubmedJournal {
  title: string | null;
  abbreviation: string | null;
  issn: string | null;
  volume: string | null;
  issue: string | null;
}

export interface PubmedArticle {
  pmid: string;
  title: string;
  abstract: PubmedAbstractSection[];
  authors: PubmedAuthor[];
  journal: PubmedJournal;
  publicationDate: string | null;
  publicationTypes: string[];
  meshTerms: string[];
  keywords: string[];
  languages: string[];
  doi: string | null;
  pmcid: string | null;
  pubmedUrl: string;
  pmcUrl: string | null;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: true,
  processEntities: true,
  trimValues: false,
});

const monthNumbers: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** Parse PubMed EFetch XML into normalized article records. */
export function parsePubmedArticleSet(xml: string): PubmedArticle[] {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new ProviderRequestError(502, "PubMed returned malformed article XML", validation.err);
  }

  const document = xmlParser.parse(xml) as XmlNode[];
  const articleSet = firstChild(document, "PubmedArticleSet");
  if (!articleSet) {
    throw new ProviderRequestError(502, "PubMed returned an article response without PubmedArticleSet");
  }

  return articleSet.content.flatMap((node) => {
    const article = elementFromNode(node, "PubmedArticle");
    if (article) {
      return [parsePubmedArticle(article)];
    }
    const bookArticle = elementFromNode(node, "PubmedBookArticle");
    return bookArticle ? [parsePubmedBookArticle(bookArticle)] : [];
  });
}

function parsePubmedArticle(pubmedArticle: XmlElement): PubmedArticle {
  const citation = requireChild(pubmedArticle.content, "MedlineCitation", "PubMed article");
  const article = requireChild(citation.content, "Article", "PubMed citation");
  const pmid = requireText(citation.content, "PMID", "PubMed citation");
  const journal = firstChild(article.content, "Journal");
  const identifiers = readArticleIdentifiers(pubmedArticle);
  const pmcid = identifiers.get("pmc") ?? null;

  return {
    pmid,
    title: childText(article.content, "ArticleTitle") ?? "",
    abstract: readAbstract(article),
    authors: readAuthors(article),
    journal: readJournal(journal),
    publicationDate: readPublicationDate(journal),
    publicationTypes: childTexts(firstChild(article.content, "PublicationTypeList"), "PublicationType"),
    meshTerms: readMeshTerms(citation),
    keywords: children(citation.content, "KeywordList").flatMap((keywordList) => childTexts(keywordList, "Keyword")),
    languages: childTexts(article, "Language"),
    doi: identifiers.get("doi") ?? readElectronicDoi(article),
    pmcid,
    pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    pmcUrl: pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : null,
  };
}

function parsePubmedBookArticle(pubmedBookArticle: XmlElement): PubmedArticle {
  const document = requireChild(pubmedBookArticle.content, "BookDocument", "PubMed book article");
  const book = requireChild(document.content, "Book", "PubMed book document");
  const pmid = requireText(document.content, "PMID", "PubMed book document");
  const identifiers = readBookArticleIdentifiers(pubmedBookArticle, document);
  const pmcid = identifiers.get("pmc") ?? null;
  const volume = childText(book.content, "Volume") ?? null;

  return {
    pmid,
    title: childText(document.content, "ArticleTitle") ?? childText(book.content, "BookTitle") ?? "",
    abstract: readAbstract(document),
    authors: readAuthors(document),
    journal: {
      title: childText(book.content, "BookTitle") ?? null,
      abbreviation: null,
      issn: null,
      volume,
      issue: null,
    },
    publicationDate: readDate(firstChild(book.content, "PubDate")),
    publicationTypes: childTexts(document, "PublicationType"),
    meshTerms: [],
    keywords: children(document.content, "KeywordList").flatMap((keywordList) => childTexts(keywordList, "Keyword")),
    languages: childTexts(document, "Language"),
    doi: identifiers.get("doi") ?? readElectronicDoi(book),
    pmcid,
    pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    pmcUrl: pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : null,
  };
}

function readAbstract(article: XmlElement): PubmedAbstractSection[] {
  const abstract = firstChild(article.content, "Abstract");
  if (!abstract) {
    return [];
  }

  return children(abstract.content, "AbstractText")
    .map((section) => ({
      label: readAttribute(section, "Label") ?? readAttribute(section, "NlmCategory") ?? null,
      text: textContent(section.content),
    }))
    .filter((section) => section.text.length > 0);
}

function readAuthors(article: XmlElement): PubmedAuthor[] {
  const authorList = firstChild(article.content, "AuthorList");
  if (!authorList) {
    return [];
  }

  return children(authorList.content, "Author").flatMap((author) => {
    const collectiveName = childText(author.content, "CollectiveName");
    const familyName = childText(author.content, "LastName");
    const givenName = childText(author.content, "ForeName") ?? childText(author.content, "Initials");
    const name = collectiveName ?? [givenName, familyName].filter(Boolean).join(" ");
    if (!name) {
      return [];
    }

    const orcid = children(author.content, "Identifier").find(
      (identifier) => readAttribute(identifier, "Source")?.toLowerCase() === "orcid",
    );

    return [
      {
        name,
        orcid: orcid ? textContent(orcid.content) || null : null,
        affiliations: children(author.content, "AffiliationInfo")
          .map((info) => childText(info.content, "Affiliation"))
          .filter((value): value is string => value !== undefined),
      },
    ];
  });
}

function readJournal(journal: XmlElement | undefined): PubmedJournal {
  const issue = journal ? firstChild(journal.content, "JournalIssue") : undefined;
  return {
    title: journal ? (childText(journal.content, "Title") ?? null) : null,
    abbreviation: journal ? (childText(journal.content, "ISOAbbreviation") ?? null) : null,
    issn: journal ? (childText(journal.content, "ISSN") ?? null) : null,
    volume: issue ? (childText(issue.content, "Volume") ?? null) : null,
    issue: issue ? (childText(issue.content, "Issue") ?? null) : null,
  };
}

function readPublicationDate(journal: XmlElement | undefined): string | null {
  const issue = journal ? firstChild(journal.content, "JournalIssue") : undefined;
  return readDate(issue ? firstChild(issue.content, "PubDate") : undefined);
}

function readDate(publicationDate: XmlElement | undefined): string | null {
  if (!publicationDate) {
    return null;
  }

  const medlineDate = childText(publicationDate.content, "MedlineDate");
  if (medlineDate) {
    return medlineDate;
  }

  const year = childText(publicationDate.content, "Year");
  if (!year) {
    return null;
  }
  const season = childText(publicationDate.content, "Season");
  if (season) {
    return `${year} ${season}`;
  }
  const month = normalizeMonth(childText(publicationDate.content, "Month"));
  const day = normalizeDay(childText(publicationDate.content, "Day"));
  return [year, month, day].filter(Boolean).join("-");
}

function readMeshTerms(citation: XmlElement): string[] {
  const headings = firstChild(citation.content, "MeshHeadingList");
  if (!headings) {
    return [];
  }

  return children(headings.content, "MeshHeading")
    .map((heading) => childText(heading.content, "DescriptorName"))
    .filter((value): value is string => value !== undefined);
}

function readArticleIdentifiers(pubmedArticle: XmlElement): Map<string, string> {
  const identifiers = new Map<string, string>();
  const pubmedData = firstChild(pubmedArticle.content, "PubmedData");
  const identifierList = pubmedData ? firstChild(pubmedData.content, "ArticleIdList") : undefined;
  addIdentifiers(identifiers, identifierList);
  return identifiers;
}

function readBookArticleIdentifiers(pubmedBookArticle: XmlElement, document: XmlElement): Map<string, string> {
  const identifiers = new Map<string, string>();
  addIdentifiers(identifiers, firstChild(document.content, "ArticleIdList"));
  const pubmedBookData = firstChild(pubmedBookArticle.content, "PubmedBookData");
  addIdentifiers(identifiers, pubmedBookData ? firstChild(pubmedBookData.content, "ArticleIdList") : undefined);
  return identifiers;
}

function addIdentifiers(identifiers: Map<string, string>, identifierList: XmlElement | undefined): void {
  if (!identifierList) {
    return;
  }
  for (const identifier of children(identifierList.content, "ArticleId")) {
    const type = readAttribute(identifier, "IdType")?.toLowerCase();
    const value = textContent(identifier.content);
    if (type && value) {
      identifiers.set(type, value);
    }
  }
}

function readElectronicDoi(article: XmlElement): string | null {
  const location = children(article.content, "ELocationID").find(
    (identifier) => readAttribute(identifier, "EIdType")?.toLowerCase() === "doi",
  );
  return location ? textContent(location.content) || null : null;
}

function normalizeMonth(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (/^\d{1,2}$/u.test(value)) {
    return value.padStart(2, "0");
  }
  return monthNumbers[value.slice(0, 3).toLowerCase()];
}

function normalizeDay(value: string | undefined): string | undefined {
  return value && /^\d{1,2}$/u.test(value) ? value.padStart(2, "0") : undefined;
}

function childTexts(parent: XmlElement | undefined, name: string): string[];
function childTexts(parent: XmlNode[], name: string): string[];
function childTexts(parent: XmlElement | XmlNode[] | undefined, name: string): string[] {
  const content = Array.isArray(parent) ? parent : parent?.content;
  return content
    ? children(content, name)
        .map((element) => textContent(element.content))
        .filter((value) => value.length > 0)
    : [];
}

function childText(content: XmlNode[], name: string): string | undefined {
  const child = firstChild(content, name);
  if (!child) {
    return undefined;
  }
  return textContent(child.content) || undefined;
}

function requireText(content: XmlNode[], name: string, source: string): string {
  const value = childText(content, name);
  if (!value) {
    throw new ProviderRequestError(502, `${source} is missing ${name}`);
  }
  return value;
}

function requireChild(content: XmlNode[], name: string, source: string): XmlElement {
  const child = firstChild(content, name);
  if (!child) {
    throw new ProviderRequestError(502, `${source} is missing ${name}`);
  }
  return child;
}

function firstChild(content: XmlNode[], name: string): XmlElement | undefined {
  return children(content, name)[0];
}

function elementFromNode(node: XmlNode, name: string): XmlElement | undefined {
  const childContent = node[name];
  return Array.isArray(childContent)
    ? {
        content: childContent as XmlNode[],
        attributes: optionalRecord(node[":@"]) ?? {},
      }
    : undefined;
}

function children(content: XmlNode[], name: string): XmlElement[] {
  return content.map((node) => elementFromNode(node, name)).filter((child): child is XmlElement => child !== undefined);
}

function readAttribute(element: XmlElement, name: string): string | undefined {
  return optionalString(element.attributes[`@_${name}`]);
}

function textContent(value: unknown): string {
  const text = decodeNumericCharacterReferences(collectText(value));
  return text.replace(/\s+/gu, " ").trim();
}

function decodeNumericCharacterReferences(value: string): string {
  return value.replace(
    /&#(?:x([\da-f]+)|(\d+));/giu,
    (reference, hex: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hex ?? decimal ?? "", hex ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : reference;
    },
  );
}

function collectText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(collectText).join("");
  }
  const record = optionalRecord(value);
  if (!record) {
    return "";
  }
  return Object.entries(record)
    .filter(([key]) => key !== ":@")
    .map(([, child]) => collectText(child))
    .join("");
}

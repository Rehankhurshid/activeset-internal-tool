export interface CollectionField {
  id: string;
  isEditable: boolean;
  isRequired: boolean;
  type: string;
  slug: string;
  displayName: string;
  helpText?: string;
}

export interface CmsCollectionSummary {
  id: string;
  displayName: string;
  slug: string;
  singularName: string;
  imageFields: CollectionField[];
  richTextFields: CollectionField[];
  totalItems: number;
}

export interface CmsImageEntry {
  /** Composite key: `${collectionId}::${itemId}::${fieldSlug}::${imageIndex}` */
  id: string;
  collectionId: string;
  collectionName: string;
  itemId: string;
  itemName: string;
  fieldSlug: string;
  fieldDisplayName: string;
  fieldType: 'Image' | 'MultiImage' | 'RichText';
  imageUrl: string;
  currentAlt: string;
  isMissingAlt: boolean;
  imageIndex: number;
  /** Original field value needed for writeback */
  rawFieldValue: unknown;
}

export interface CmsUpdatePayload {
  collectionId: string;
  itemId: string;
  fieldSlug: string;
  fieldType: 'Image' | 'MultiImage' | 'RichText';
  newAlt: string;
  newUrl?: string;
  imageIndex: number;
  rawFieldValue: unknown;
}

export interface CmsAltSuggestion {
  entryId: string;
  altText: string;
  reason?: string;
}

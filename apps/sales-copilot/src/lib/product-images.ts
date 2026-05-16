export type ImageFallbackCategory =
  | 'Patient Monitoring'
  | 'Ultrasound'
  | 'Anesthesia'
  | 'IVD'
  | 'Medical Imaging'
  | 'default';

export const imageFallbackByCategory: Record<ImageFallbackCategory, string> = {
  'Patient Monitoring': 'https://cdn.hubblecontent.osi.office.net/m365content/publish/58044694-9de2-46ec-923b-360d52a8fa67/thumbnails/large.jpg',
  Ultrasound: 'https://cdn.hubblecontent.osi.office.net/m365content/publish/9b3e90c9-27d9-4651-ad6c-47f7f19d8444/thumbnails/large.jpg',
  Anesthesia: 'https://cdn.hubblecontent.osi.office.net/m365content/publish/61dbd415-a5a9-4516-8ef3-423bcf8fe6bb/thumbnails/large.jpg',
  IVD: 'https://cdn.hubblecontent.osi.office.net/m365content/publish/33c95f88-7fc4-4701-85ab-bfcd03be2257/thumbnails/large.jpg',
  'Medical Imaging': 'https://cdn.hubblecontent.osi.office.net/m365content/publish/338eb06c-8fbd-4784-a723-baf82ef2cd96/thumbnails/large.jpg',
  default: 'https://cdn.hubblecontent.osi.office.net/m365content/publish/038344d3-5051-48a4-a414-dacc6d8034e0/thumbnails/large.jpg',
};

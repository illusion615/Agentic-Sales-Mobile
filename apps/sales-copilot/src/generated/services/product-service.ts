import { Crf5c_productsService } from './Crf5c_productsService';
import type { Crf5c_products } from '../models/Crf5c_productsModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Product } from '../models/product-model';
import { dvNum, numToDv, mapOptions, requireCreated, requireId } from './_adapter-utils';

const FIELD_MAP: Record<string, string> = {
  id: 'crf5c_productid',
  productName: 'crf5c_productname',
  category: 'crf5c_category',
  featureHighlight: 'crf5c_featurehighlight',
  imageURL: 'crf5c_imageurl',
  productURL: 'crf5c_producturl',
  sortOrder: 'crf5c_sortorder',
  specification: 'crf5c_specification',
  summary: 'crf5c_summary',
};

function fromDv(dv: Crf5c_products): Product {
  return {
    id: dv.crf5c_productid,
    productName: dv.crf5c_productname,
    category: dv.crf5c_category,
    featureHighlight: dv.crf5c_featurehighlight,
    imageURL: dv.crf5c_imageurl,
    productURL: dv.crf5c_producturl,
    sortOrder: dvNum(dv.crf5c_sortorder) ?? 0,
    specification: dv.crf5c_specification,
    summary: dv.crf5c_summary,
  };
}

function toDv(r: Partial<Omit<Product, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.productName !== undefined) dv.crf5c_productname = r.productName;
  if (r.category !== undefined) dv.crf5c_category = r.category;
  if (r.featureHighlight !== undefined) dv.crf5c_featurehighlight = r.featureHighlight;
  if (r.imageURL !== undefined) dv.crf5c_imageurl = r.imageURL;
  if (r.productURL !== undefined) dv.crf5c_producturl = r.productURL;
  if (r.sortOrder !== undefined) dv.crf5c_sortorder = numToDv(r.sortOrder);
  if (r.specification !== undefined) dv.crf5c_specification = r.specification;
  if (r.summary !== undefined) dv.crf5c_summary = r.summary;
  return dv;
}

export class ProductService {
  static async create(record: Omit<Product, 'id'>): Promise<Product> {
    const result = await Crf5c_productsService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(requireCreated(result.data, 'crf5c_productid', 'Product'));
  }

  static async update(id: string, changedFields: Partial<Omit<Product, 'id'>>): Promise<Product> {
    requireId(id, 'update', 'Product');
    const result = await Crf5c_productsService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'Product');
    await Crf5c_productsService.delete(id);
  }

  static async get(id: string): Promise<Product> {
    requireId(id, 'get', 'Product');
    const result = await Crf5c_productsService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<Product[]> {
    const result = await Crf5c_productsService.getAll(mapOptions(options, FIELD_MAP) as any);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}
import { test } from "node:test"
import assert from "node:assert/strict"
import { mapCampaign, mapListing, mapSearch, mapType, parsePrice } from "./map.ts"

const raw = (over: Record<string, unknown> = {}) => ({
  propertySummary: {
    id: 123,
    propertyType: "HOUSE",
    address: { singleLineAddress: "1 Main St Blacktown NSW 2148" },
    coordinate: { latitude: -33.77, longitude: 150.9 },
    attributes: { bedrooms: 3, bathrooms: 2, carSpaces: 1, landArea: 556 },
    propertyPhoto: { mediumPhotoUrl: "https://img/x.jpg" },
    otmForSaleDetail: {
      priceDescription: "$1,250,000",
      agent: "A Agent",
      agency: "Agency Co",
      method: "Normal Sale",
      date: "2026-10-01T00:00:00Z",
    },
    ...over,
  },
})

test("parsePrice reads a single dollar amount", () => {
  assert.equal(parsePrice("$1,250,000"), 1250000)
  assert.equal(parsePrice(" $950000 "), 950000)
})

test("parsePrice returns null for anything that isn't one amount", () => {
  for (const s of ["Auction", "Contact agent", "$1.1m - $1.2m", "$950,000+", "", null]) {
    assert.equal(parsePrice(s), null, String(s))
  }
})

test("mapType maps Cotality property types", () => {
  assert.equal(mapType("HOUSE"), "house")
  assert.equal(mapType("UNIT"), "apartment")
  assert.equal(mapType("FLATS"), "apartment")
  assert.equal(mapType("LAND"), "development")
  assert.equal(mapType(undefined), "development")
})

test("mapListing maps a full record", () => {
  assert.deepEqual(mapListing(raw(), "Blacktown"), {
    id: "cl-123",
    cotalityId: 123,
    address: "1 Main St Blacktown NSW 2148",
    suburb: "Blacktown",
    state: "NSW",
    lat: -33.77,
    lng: 150.9,
    type: "house",
    beds: 3,
    baths: 2,
    parking: 1,
    landSize: 556,
    priceLabel: "$1,250,000",
    price: 1250000,
    method: "Normal Sale",
    listedAt: "2026-10-01T00:00:00Z",
    agentName: "A Agent",
    agency: "Agency Co",
    image: "https://img/x.jpg",
  })
})

test("mapListing turns missing optional fields into null", () => {
  const l = mapListing(
    raw({ attributes: {}, otmForSaleDetail: {}, propertyPhoto: undefined }),
    "Blacktown",
  )
  assert.ok(l)
  assert.equal(l.beds, null)
  assert.equal(l.landSize, null)
  assert.equal(l.priceLabel, null)
  assert.equal(l.price, null)
  assert.equal(l.agentName, null)
  assert.equal(l.image, null)
})

test("mapListing drops records without id or coordinates", () => {
  assert.equal(mapListing(raw({ id: undefined }), "Blacktown"), null)
  assert.equal(mapListing(raw({ coordinate: {} }), "Blacktown"), null)
  assert.equal(mapListing({}, "Blacktown"), null)
})

test("mapSearch maps paging and skips bad records", () => {
  const body = {
    _embedded: { propertySummaryList: [raw(), raw({ coordinate: null })] },
    page: { totalElements: 182, totalPages: 10, number: 0, size: 20 },
  }
  const r = mapSearch(body, "Blacktown", 0)
  assert.equal(r.total, 182)
  assert.equal(r.totalPages, 10)
  assert.equal(r.listings.length, 1)
  assert.deepEqual(mapSearch({}, "Blacktown", 2), {
    suburb: "Blacktown", page: 2, totalPages: 0, total: 0, listings: [],
  })
})

test("mapCampaign picks the active campaign", () => {
  const body = {
    forSalePropertyCampaign: {
      campaigns: [
        { isActiveCampaign: false, agent: { agent: "Old", phoneNumber: "1" } },
        {
          isActiveCampaign: true,
          agent: { agent: "New Agent", phoneNumber: "0400 000 000" },
          agency: { companyName: "Agency Co", phoneNumber: "02 0000 0000" },
          priceDescription: "Auction",
          auctionDate: "2026-11-01",
          daysOnMarket: 12,
        },
      ],
    },
  }
  assert.deepEqual(mapCampaign(body), {
    agentName: "New Agent",
    agentPhone: "0400 000 000",
    agency: "Agency Co",
    agencyPhone: "02 0000 0000",
    priceLabel: "Auction",
    auctionDate: "2026-11-01",
    daysOnMarket: 12,
  })
})

test("mapCampaign returns null without an active campaign", () => {
  assert.equal(mapCampaign({ forSalePropertyCampaign: { campaigns: [{ isActiveCampaign: false }] } }), null)
  assert.equal(mapCampaign(null), null)
})

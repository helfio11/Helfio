package com.helfio.marketplace;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class ApiValidationTest {
  @Test
  void acceptsNodeCompatibleJobDefaultsAndNormalizesValues() {
    var body = new LinkedHashMap<String, Object>();
    body.put("categoryId", "11111111-1111-4111-8111-111111111111");
    body.put("title", "  Clean home  ");
    body.put("description", "  Details  ");
    body.put("city", "  Berlin ");
    body.put("countryCode", "de");
    body.put("budgetType", "FIXED");
    body.put("currency", "eur");

    ApiValidation.job(body, false);

    assertEquals("Clean home", body.get("title"));
    assertEquals("DE", body.get("countryCode"));
    assertNull(body.get("budgetMin"));
    assertNull(body.get("preferredDate"));
  }

  @Test
  void rejectsUnknownFieldsAndInvalidOfferValues() {
    var job = new LinkedHashMap<String, Object>();
    job.put("categoryId", "category");
    job.put("unexpected", true);
    assertThrows(ResponseStatusException.class, () -> ApiValidation.job(job, true));

    var offer = new LinkedHashMap<String, Object>();
    offer.put("price", -1);
    offer.put("currency", "EUR");
    offer.put("message", "Offer");
    var error = assertThrows(ResponseStatusException.class, () -> ApiValidation.offer(offer, false));
    assertEquals(400, error.getStatusCode().value());
  }

  @Test
  void validatesReviewShape() {
    var review = new LinkedHashMap<String, Object>();
    review.put("rating", 5);
    review.put("comment", "  Great work ");

    ApiValidation.review(review);

    assertEquals("Great work", review.get("comment"));
  }
}

package com.helfio.marketplace;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class MarketplaceControllerContractTest {
  private MarketplaceService service;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    service = mock(MarketplaceService.class);
    mvc = MockMvcBuilders.standaloneSetup(new MarketplaceController(service)).setControllerAdvice(new ApiErrors()).build();
  }

  @Test
  void invalidJobRequestMatchesNodeBadRequestContract() throws Exception {
    mvc.perform(post("/api/v1/jobs")
        .contentType("application/json")
        .content("{\"categoryId\":\"category\",\"title\":\"Job\",\"unexpected\":true}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("Invalid request"));
    verifyNoInteractions(service);
  }

  @Test
  void createJobUsesCreatedDataEnvelope() throws Exception {
    when(service.createJob(any(), any())).thenReturn(Map.of("id", "job-id"));

    mvc.perform(post("/api/v1/jobs")
        .contentType("application/json")
        .content("{\"categoryId\":\"11111111-1111-4111-8111-111111111111\",\"title\":\"Job\",\"description\":\"Details\",\"city\":\"Berlin\",\"countryCode\":\"DE\",\"budgetType\":\"FIXED\",\"currency\":\"EUR\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.id").value("job-id"));
  }

  @Test
  void invalidOfferAndReviewRequestsAreBadRequests() throws Exception {
    mvc.perform(post("/api/v1/jobs/11111111-1111-4111-8111-111111111111/offers")
        .contentType("application/json")
        .content("{\"price\":-1,\"currency\":\"EUR\",\"message\":\"Offer\"}"))
        .andExpect(status().isBadRequest());

    mvc.perform(post("/api/v1/jobs/11111111-1111-4111-8111-111111111111/review")
        .contentType("application/json")
        .content("{\"rating\":6}"))
        .andExpect(status().isBadRequest());
  }
}

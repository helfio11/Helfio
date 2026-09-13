package com.helfio.marketplace;

import java.util.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class MarketplaceController {
  private final MarketplaceService service;
  public MarketplaceController(MarketplaceService service) { this.service = service; }
  private Map<String,Object> data(Object value) { return Map.of("data", value); }
  @GetMapping("/jobs") @PreAuthorize("hasRole('CUSTOMER')") public Map<String,Object> jobs(Authentication a) { return data(service.customerJobs(a)); }
  @PostMapping("/jobs") @PreAuthorize("hasRole('CUSTOMER')") public ResponseEntity<?> create(Authentication a,@RequestBody Map<String,Object> b){ApiValidation.job(b,false);return ResponseEntity.status(201).body(data(service.createJob(a,b)));}
  @GetMapping("/jobs/{id}") @PreAuthorize("hasRole('CUSTOMER')") public Map<String,Object> job(Authentication a,@PathVariable UUID id){return data(service.customerJob(a,id));}
  @GetMapping("/jobs/public/{id}") public Map<String,Object> publicJob(@PathVariable UUID id){return data(service.publicJob(id));}
  @PatchMapping("/jobs/{id}") @PreAuthorize("hasRole('CUSTOMER')") public Map<String,Object> update(Authentication a,@PathVariable UUID id,@RequestBody Map<String,Object> b){ApiValidation.job(b,true);return data(service.updateJob(a,id,b));}
  @PostMapping("/jobs/{id}/{action:publish|cancel|confirm}") @PreAuthorize("hasRole('CUSTOMER')") public Map<String,Object> transition(Authentication a,@PathVariable UUID id,@PathVariable String action){return data(service.transition(a,id,action));}
  @PostMapping("/jobs/{id}/review") @PreAuthorize("hasRole('CUSTOMER')") public ResponseEntity<?> review(Authentication a,@PathVariable UUID id,@RequestBody Map<String,Object> b){ApiValidation.review(b);return ResponseEntity.status(201).body(data(service.review(a,id,b)));}
  @GetMapping("/providers/{id}/reviews") public Map<String,Object> providerReviews(@PathVariable UUID id){return data(service.publicReviews(id));}
  @GetMapping("/providers/{id}/rating") public Map<String,Object> providerRating(@PathVariable UUID id){return data(service.providerRating(id));}
  @GetMapping("/provider/jobs") @PreAuthorize("hasRole('PROVIDER')") public Map<String,Object> open(@RequestParam(required=false) String categoryId,@RequestParam(required=false) String city){return data(service.openJobs(categoryId,city).stream().map(service::providerView).toList());}
  @GetMapping("/provider/jobs/assigned") @PreAuthorize("hasRole('PROVIDER')") public Map<String,Object> assigned(Authentication a){return data(service.assignedJobs(a).stream().map(service::providerView).toList());}
  @GetMapping("/provider/jobs/{id}") @PreAuthorize("hasRole('PROVIDER')") public Map<String,Object> providerJob(@PathVariable UUID id){return data(service.providerOpenJob(id));}
  @PostMapping("/provider/jobs/{id}/{action:start|finish}") @PreAuthorize("hasRole('PROVIDER')") public Map<String,Object> providerTransition(Authentication a,@PathVariable UUID id,@PathVariable String action){return data(service.providerTransition(a,id,action));}
  @GetMapping("/provider/offers") @PreAuthorize("hasRole('PROVIDER')") public Map<String,Object> providerOffers(Authentication a){return data(service.offersForProvider(a));}
  @GetMapping("/jobs/{id}/offers") @PreAuthorize("hasRole('CUSTOMER')") public Map<String,Object> jobOffers(Authentication a,@PathVariable UUID id){return data(service.offersForJob(a,id));}
  @PostMapping("/jobs/{id}/offers") @PreAuthorize("hasRole('PROVIDER')") public ResponseEntity<?> createOffer(Authentication a,@PathVariable UUID id,@RequestBody Map<String,Object> b){ApiValidation.offer(b,false);return ResponseEntity.status(201).body(data(service.createOffer(a,id,b)));}
  @PostMapping("/offers/{id}/{action:accept|reject}") @PreAuthorize("hasRole('CUSTOMER')") public Map<String,Object> offerAction(Authentication a,@PathVariable UUID id,@PathVariable String action){return data(service.offerAction(a,id,action));}
  @PostMapping("/offers/{id}/withdraw") @PreAuthorize("hasRole('PROVIDER')") public Map<String,Object> withdraw(Authentication a,@PathVariable UUID id){return data(service.withdraw(a,id));}
  @PatchMapping("/offers/{id}") @PreAuthorize("hasRole('PROVIDER')") public Map<String,Object> updateOffer(Authentication a,@PathVariable UUID id,@RequestBody Map<String,Object> b){ApiValidation.offer(b,true);return data(service.updateOffer(a,id,b));}
}
